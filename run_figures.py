"""Helper: find kidney project dir and run figure generation scripts."""
import os
import subprocess
import sys

def find_kidney_project():
    """Find the kidney virtual cell project directory on D:."""
    result = subprocess.run(
        'cmd.exe /d /c "dir /b /ad D:\\"',
        capture_output=True, text=True, encoding='gbk', shell=True
    )
    for line in result.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        full = os.path.join('D:/', line)
        check = os.path.join(full, 'code', 'main', 'generate_figures.py')
        if os.path.isfile(check):
            return line  # Return just the directory name, not full path
    return None

def main():
    proj_name = find_kidney_project()
    if not proj_name:
        print("ERROR: Could not find kidney project directory")
        sys.exit(1)
    print(f"Project directory name: {proj_name}")

    scripts = [
        'generate_figures.py',
        'generate_figures_4_6.py',
        'generate_figures_7_8.py',
    ]

    for script in scripts:
        print(f"\n{'='*60}")
        print(f"Running: {script}")
        print(f"{'='*60}")
        # Use cmd.exe to chain cd + python, avoiding bash encoding issues
        cmd = f'cmd.exe /d /c "cd /d D:\\{proj_name}\\code\\main && C:\\Python314\\python.exe {script}"'
        result = subprocess.run(
            cmd,
            capture_output=True, text=True, encoding='gbk', shell=True
        )
        print(result.stdout)
        if result.stderr:
            print("STDERR:", result.stderr[:1000])
        print(f"Exit code: {result.returncode}")

if __name__ == '__main__':
    main()

if __name__ == '__main__':
    main()
