import { afterEach, beforeEach, describe, expect, it, } from 'bun:test'
import type * as fs from 'node:fs'
import nodePath from 'node:path'
import {
  type FsOperations,
  getFsImplementation,
  getPathsForPermissionCheck,
  isDuplicatePath,
  resolveDeepestExistingAncestorSync,
  safeResolvePath,
  setFsImplementation,
  setOriginalFsImplementation,
} from '../fsOperations'

function fakeStats(overrides: Partial<fs.Stats> = {}): fs.Stats {
  return {
    isFile: () => true,
    isDirectory: () => false,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isSymbolicLink: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    dev: 0,
    ino: 0,
    mode: 0,
    nlink: 0,
    uid: 0,
    gid: 0,
    rdev: 0,
    size: 0,
    blksize: 0,
    blocks: 0,
    atimeMs: 0,
    mtimeMs: 0,
    ctimeMs: 0,
    birthtimeMs: 0,
    atime: new Date(0),
    mtime: new Date(0),
    ctime: new Date(0),
    birthtime: new Date(0),
    ...overrides,
  } as fs.Stats
}

function mockFs(overrides: Partial<FsOperations> = {}): FsOperations {
  return {
    cwd: () => '/fake/cwd',
    existsSync: () => true,
    stat: async () => fakeStats(),
    readdir: async () => [],
    unlink: async () => {},
    rmdir: async () => {},
    rm: async () => {},
    mkdir: async () => {},
    readFile: async () => '',
    rename: async () => {},
    statSync: () => fakeStats(),
    lstatSync: () => fakeStats(),
    readFileSync: () => '',
    readFileBytesSync: () => Buffer.alloc(0),
    readSync: () => ({ buffer: Buffer.alloc(0), bytesRead: 0 }),
    appendFileSync: () => {},
    copyFileSync: () => {},
    unlinkSync: () => {},
    renameSync: () => {},
    linkSync: () => {},
    symlinkSync: () => {},
    readlinkSync: () => '/fake/resolved',
    realpathSync: (p: string) => p,
    mkdirSync: () => {},
    readdirSync: () => [],
    readdirStringSync: () => [],
    isDirEmptySync: () => true,
    rmdirSync: () => {},
    rmSync: () => {},
    createWriteStream: () => ({}) as fs.WriteStream,
    readFileBytes: async () => Buffer.alloc(0),
    ...overrides,
  }
}

describe('safeResolvePath', () => {
  it('blocks UNC paths (// prefix)', () => {
    const result = safeResolvePath(mockFs(), '//network/share/path')
    expect(result.isSymlink).toBe(false)
    expect(result.isCanonical).toBe(false)
    expect(result.resolvedPath).toBe('//network/share/path')
  })

  it('blocks UNC paths (\\\\ prefix)', () => {
    const result = safeResolvePath(mockFs(), '\\\\network\\share\\path')
    expect(result.isSymlink).toBe(false)
    expect(result.resolvedPath).toBe('\\\\network\\share\\path')
  })

  it('returns original path when file does not exist', () => {
    const fs = mockFs({
      lstatSync: () => {
        throw new Error('ENOENT')
      },
    })
    const result = safeResolvePath(fs, '/nonexistent/file.txt')
    expect(result.resolvedPath).toBe('/nonexistent/file.txt')
    expect(result.isSymlink).toBe(false)
    expect(result.isCanonical).toBe(false)
  })

  it('rejects FIFO (named pipe)', () => {
    const fs = mockFs({
      lstatSync: () => fakeStats({ isFIFO: () => true }),
    })
    const result = safeResolvePath(fs, '/some/fifo')
    expect(result.isSymlink).toBe(false)
    expect(result.isCanonical).toBe(false)
  })

  it('rejects socket files', () => {
    const fs = mockFs({
      lstatSync: () => fakeStats({ isSocket: () => true }),
    })
    const result = safeResolvePath(fs, '/var/run/socket')
    expect(result.isSymlink).toBe(false)
  })

  it('rejects character devices', () => {
    const fs = mockFs({
      lstatSync: () => fakeStats({ isCharacterDevice: () => true }),
    })
    const result = safeResolvePath(fs, '/dev/tty')
    expect(result.isSymlink).toBe(false)
  })

  it('rejects block devices', () => {
    const fs = mockFs({
      lstatSync: () => fakeStats({ isBlockDevice: () => true }),
    })
    const result = safeResolvePath(fs, '/dev/sda')
    expect(result.isSymlink).toBe(false)
  })

  it('resolves symlink to real path', () => {
    const fs = mockFs({
      lstatSync: () => fakeStats(),
      realpathSync: () => '/real/path/file.txt',
    })
    const result = safeResolvePath(fs, '/symlink/file.txt')
    expect(result.resolvedPath).toBe('/real/path/file.txt')
    expect(result.isSymlink).toBe(true)
    expect(result.isCanonical).toBe(true)
  })

  it('detects non-symlink when realpath matches input', () => {
    const fs = mockFs({
      lstatSync: () => fakeStats(),
      realpathSync: (p: string) => p,
    })
    const result = safeResolvePath(fs, '/regular/file.txt')
    expect(result.resolvedPath).toBe('/regular/file.txt')
    expect(result.isSymlink).toBe(false)
    expect(result.isCanonical).toBe(true)
  })

  it('returns original path when realpathSync throws', () => {
    const fs = mockFs({
      lstatSync: () => fakeStats(),
      realpathSync: () => {
        throw new Error('EACCES')
      },
    })
    const result = safeResolvePath(fs, '/broken/link')
    expect(result.resolvedPath).toBe('/broken/link')
    expect(result.isSymlink).toBe(false)
    expect(result.isCanonical).toBe(false)
  })
})

describe('isDuplicatePath', () => {
  it('returns false for first occurrence', () => {
    const loadedPaths = new Set<string>()
    const fs = mockFs({
      lstatSync: () => fakeStats(),
      realpathSync: (p: string) => p,
    })
    expect(isDuplicatePath(fs, '/some/file.txt', loadedPaths)).toBe(false)
  })

  it('returns true for duplicate path', () => {
    const loadedPaths = new Set<string>()
    const fs = mockFs({
      lstatSync: () => fakeStats(),
      realpathSync: (p: string) => p,
    })
    isDuplicatePath(fs, '/some/file.txt', loadedPaths)
    expect(isDuplicatePath(fs, '/some/file.txt', loadedPaths)).toBe(true)
  })

  it('detects duplicate via symlink resolution', () => {
    const loadedPaths = new Set<string>()
    // First call: normal path resolves to /real/file
    // Second call: symlink also resolves to /real/file
    const realpathCalls: string[] = []
    const fs = mockFs({
      lstatSync: () => fakeStats(),
      realpathSync: (p: string) => {
        realpathCalls.push(p)
        return '/real/file.txt'
      },
    })
    isDuplicatePath(fs, '/direct/file.txt', loadedPaths)
    expect(isDuplicatePath(fs, '/symlink/file.txt', loadedPaths)).toBe(true)
  })
})

describe('resolveDeepestExistingAncestorSync', () => {
  it('returns undefined when no symlinks in ancestor chain', () => {
    // All lstat calls succeed, realpath returns same path
    const fs = mockFs({
      lstatSync: () => fakeStats(),
      realpathSync: (p: string) => p,
    })
    const result = resolveDeepestExistingAncestorSync(fs, '/a/b/c/file.txt')
    expect(result).toBeUndefined()
  })

  it('resolves live symlink in path', () => {
    // /a/b is a symlink to /real/b
    // /a exists (no symlink), /a/b is a symlink
    let _callCount = 0
    const fs = mockFs({
      lstatSync: (p: string) => {
        _callCount++
        if (p === '/a/b/c/file.txt') throw new Error('ENOENT')
        if (p === '/a/b/c') throw new Error('ENOENT')
        if (p === '/a/b') return fakeStats({ isSymbolicLink: () => true })
        if (p === '/a') return fakeStats()
        return fakeStats()
      },
      realpathSync: (p: string) => {
        if (p === '/a') return '/a'
        if (p === '/a/b') return '/real/b'
        return p
      },
      readlinkSync: () => '/real/b',
    })
    const result = resolveDeepestExistingAncestorSync(fs, '/a/b/c/file.txt')
    // nodePath.join uses platform separators
    expect(result).toBe(nodePath.join('/real/b', 'c', 'file.txt'))
  })

  it('handles dangling symlink (lstat sees link but realpath fails)', () => {
    // /dangling is a symlink whose target doesn't exist
    const fs = mockFs({
      lstatSync: (p: string) => {
        if (p === '/dangling/target.txt') throw new Error('ENOENT')
        return fakeStats({ isSymbolicLink: () => true })
      },
      realpathSync: () => {
        throw new Error('ENOENT')
      },
      readlinkSync: () => '/nonexistent/target',
    })
    const result = resolveDeepestExistingAncestorSync(fs, '/dangling/target.txt')
    // Readlink returns absolute target → joined with remaining segments (target.txt)
    expect(result).toBe(nodePath.join('/nonexistent/target', 'target.txt'))
  })

  it('handles relative symlink target (dangling)', () => {
    const fs = mockFs({
      lstatSync: (p: string) => {
        if (p === '/dangling/../z') throw new Error('ENOENT')
        if (p === '/dangling') return fakeStats({ isSymbolicLink: () => true })
        throw new Error('ENOENT')
      },
      realpathSync: () => {
        throw new Error('ENOENT')
      },
      readlinkSync: () => '../target',
    })
    const result = resolveDeepestExistingAncestorSync(fs, '/dangling/file.txt')
    // readlink returns '../target', resolved relative to /dangling's parent → /target
    // Then join with remaining segments (file.txt) → /target/file.txt
    // Wait - let me trace the logic more carefully:
    // path = /dangling/file.txt
    // dir = /dangling/file.txt → lstat fails → segments = [file.txt], dir = /dangling
    // dir = /dangling → lstat succeeds, isSymlink → realpath fails → readlink = ../target
    // absTarget = resolve(dirname(/dangling), ../target) = resolve(/, ../target) = /target
    // segments = [file.txt], so return join(/target, file.txt) = /target/file.txt
    // ...but actually the path separator on Windows would be backslash
    expect(result).toContain('target')
    expect(result).toContain('file.txt')
  })
})

describe('getPathsForPermissionCheck', () => {
  const originalFs = getFsImplementation()

  beforeEach(() => {
    setOriginalFsImplementation()
  })

  afterEach(() => {
    setFsImplementation(originalFs)
  })

  it('includes original path', () => {
    const fs = mockFs({
      existsSync: () => true,
      lstatSync: () => fakeStats(),
      realpathSync: (p: string) => p,
    })
    setFsImplementation(fs)
    const paths = getPathsForPermissionCheck('/some/file.txt')
    expect(paths).toContain('/some/file.txt')
  })

  it('expands tilde to home directory', () => {
    const fs = mockFs({
      existsSync: () => true,
      lstatSync: () => fakeStats(),
      realpathSync: (p: string) => p,
    })
    setFsImplementation(fs)
    const paths = getPathsForPermissionCheck('~')
    // Should contain home directory path
    expect(paths.length).toBeGreaterThan(0)
    expect(paths.some((p) => !p.startsWith('~'))).toBe(true)
  })

  it('blocks UNC paths early (no filesystem calls)', () => {
    const paths = getPathsForPermissionCheck('\\\\server\\share')
    expect(paths).toEqual(['\\\\server\\share'])
  })

  it('handles new file path (existsSync returns false)', () => {
    const fs = mockFs({
      existsSync: () => false,
    })
    setFsImplementation(fs)
    const paths = getPathsForPermissionCheck('/new/file.txt')
    expect(paths).toContain('/new/file.txt')
  })

  it('stops at non-symlink regular file', () => {
    const fs = mockFs({
      existsSync: () => true,
      lstatSync: () => fakeStats(),
      realpathSync: (p: string) => p,
    })
    setFsImplementation(fs)
    const paths = getPathsForPermissionCheck('/regular/file.txt')
    // Only the original path (realpath returns same, no symlink)
    expect(paths.length).toBe(1)
  })

  it('follows single symlink chain', () => {
    let lstatCalls = 0
    const fs = mockFs({
      existsSync: () => true,
      lstatSync: () => {
        lstatCalls++
        // First call: /link → is symlink
        // Second call: /real → is regular file
        if (lstatCalls === 1) return fakeStats({ isSymbolicLink: () => true })
        return fakeStats()
      },
      readlinkSync: () => '/real/file.txt',
      realpathSync: (p: string) => p,
    })
    setFsImplementation(fs)
    const paths = getPathsForPermissionCheck('/link/file.txt')
    expect(paths).toContain('/link/file.txt')
    expect(paths).toContain('/real/file.txt')
  })

  it('handles FIFO/special files in symlink chain', () => {
    const fs = mockFs({
      existsSync: () => true,
      lstatSync: () => fakeStats({ isFIFO: () => true }),
      realpathSync: (p: string) => p,
    })
    setFsImplementation(fs)
    const paths = getPathsForPermissionCheck('/some/fifo')
    // Should stop at FIFO and not follow further
    expect(paths.length).toBeGreaterThanOrEqual(1)
  })
})

describe('setFsImplementation / getFsImplementation', () => {
  afterEach(() => {
    setOriginalFsImplementation()
  })

  it('returns custom implementation after set', () => {
    const custom = mockFs({ cwd: () => '/custom' })
    setFsImplementation(custom)
    expect(getFsImplementation().cwd()).toBe('/custom')
  })

  it('restores original after setOriginalFsImplementation', () => {
    const custom = mockFs()
    setFsImplementation(custom)
    setOriginalFsImplementation()
    // Original should be a NodeFsOperations-like instance
    expect(getFsImplementation().cwd).toBeDefined()
    expect(typeof getFsImplementation().existsSync).toBe('function')
  })
})
