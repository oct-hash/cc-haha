// Sound file generator using Web Audio API via Bun
// Run: bun .claude/hooks/scripts/generate-sounds.ts

const fs = require('fs');
const path = require('path');

// Generate a simple beep using WAV format
function generateBeep(frequency, duration, filename, volume = 0.5) {
  const sampleRate = 44100;
  const numSamples = Math.floor(sampleRate * duration);
  const numChannels = 1;
  const bitsPerSample = 16;

  // Create buffer for WAV header (44 bytes) + audio data
  const dataSize = numSamples * numChannels * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // chunk size
  buffer.writeUInt16LE(1, 20); // audio format (PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28); // byte rate
  buffer.writeUInt16LE(numChannels * (bitsPerSample / 8), 32); // block align
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Generate sine wave
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Add envelope for smooth attack/release
    let envelope = 1;
    const attackTime = 0.01;
    const releaseTime = 0.05;
    if (t < attackTime) {
      envelope = t / attackTime;
    } else if (t > duration - releaseTime) {
      envelope = (duration - t) / releaseTime;
    }

    const sample = Math.sin(2 * Math.PI * frequency * t) * volume * envelope;
    const intSample = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
    buffer.writeInt16LE(intSample, 44 + i * 2);
  }

  fs.writeFileSync(filename, buffer);
  console.log(`Generated: ${filename} (${frequency}Hz, ${duration}s)`);
}

// Hook frequencies - each hook gets a unique tone
const hookFrequencies = {
  // Main hooks - distinct tones
  'pretooluse': 440,           // A4 - "please proceed"
  'posttooluse': 523,          // C5 - "completed"
  'permissionrequest': 659,    // E5 - "waiting for approval"
  'posttoolusefailure': 349,   // F4 - "failed"
  'userpromptsubmit': 784,     // G5 - "user spoke"
  'notification': 880,          // A5 - "notification"
  'stop': 1047,                // C6 - "stopped"
  'subagentstart': 1175,       // D6 - "agent started"
  'subagentstop': 1319,        // E6 - "agent stopped"
  'precompact': 1397,          // F6 - "compacting"
  'postcompact': 1568,         // G6 - "compacted"
  'sessionstart': 1760,        // A6 - "session started"
  'sessionend': 1976,          // B6 - "session ended"
  'setup': 2093,               // C7 - "setup"
  'teammateidle': 2349,        // B6 - "idle"
  'taskcreated': 2637,         // E7 - "task created"
  'taskcompleted': 2793,       // F7 - "task done"
  'configchange': 2960,        // F#7 - "config changed"
  'worktreecreate': 3136,      // G7 - "worktree created"
  'worktreeremove': 3520,      // A7 - "worktree removed"
  'instructionsloaded': 3700,  // A#7 - "instructions loaded"
  'elicitation': 3951,         // B7 - "elicitation"
  'elicitationresult': 4186,   // C8 - "elicitation result"
  'stopfailure': 2093,         // C7 - "error"
  'cwdchanged': 4400,          // C8 - "directory changed"
  'filechanged': 4662,         // C#8 - "file changed"
  'permissiondenied': 262,     // C4 - "denied"

  // Agent hooks (lower, warmer tones)
  'agent_pretooluse': 330,     // E4
  'agent_posttooluse': 392,    // G4
  'agent_permissionrequest': 494, // B4
  'agent_posttoolusefailure': 262, // C4
  'agent_stop': 294,           // D4
  'agent_subagentstop': 370,   // F#4

  // Special command sounds
  'pretooluse-git-committing': 523,   // C5 - git commit
  'pretooluse-git-pushing': 659,      // E5 - git push
  'pretooluse-git-pulling': 784,      // G5 - git pull
  'pretooluse-installing': 1047,     // C6 - npm install
};

// Sound duration settings (in seconds)
const soundSettings = {
  'default': 0.15,
  'notification': 0.2,
  'stop': 0.3,
  'sessionstart': 0.5,
  'sessionend': 0.5,
  'stopfailure': 0.4,
  'setup': 0.4,
};

// Get duration for a hook
function getDuration(name) {
  for (const [key, duration] of Object.entries(soundSettings)) {
    if (name.includes(key)) return duration;
  }
  return soundSettings['default'];
}

// Generate all sounds
const soundsDir = path.join(__dirname, '..', 'sounds');

console.log('🎵 Generating sound files for Claude Code hooks...\n');

for (const [name, freq] of Object.entries(hookFrequencies)) {
  // Determine directory and filename
  let dir, filename;

  if (name.startsWith('agent_')) {
    // Agent-specific sound
    const hookName = name.replace('agent_', '');
    dir = path.join(soundsDir, name);
    filename = path.join(dir, `${name}.wav`);
  } else if (name.startsWith('pretooluse-git-') || name.startsWith('pretooluse-installing')) {
    // Special command sound in pretooluse folder
    dir = path.join(soundsDir, 'pretooluse');
    filename = path.join(dir, `${name}.wav`);
  } else {
    // Regular hook sound
    dir = path.join(soundsDir, name);
    filename = path.join(dir, `${name}.wav`);
  }

  // Create directory if it doesn't exist
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const duration = getDuration(name);
  generateBeep(freq, duration, filename);
}

console.log('\n✅ All sound files generated successfully!');
console.log('\nTo convert to MP3, install ffmpeg and run:');
console.log('  for f in .claude/hooks/sounds/**/*.wav; do ffmpeg -i "$f" "${f%.wav}.mp3"; done');