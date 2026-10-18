"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateDemoAudioBuffer = generateDemoAudioBuffer;
function generateDemoAudioBuffer(preset, durationSec = 16) {
    const sampleRate = 22050;
    const numChannels = 1;
    const bitsPerSample = 16;
    const numSamples = sampleRate * durationSec;
    const dataSize = numSamples * numChannels * (bitsPerSample / 8);
    const buffer = Buffer.alloc(44 + dataSize);
    // RIFF WAV Header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // PCM chunk size
    buffer.writeUInt16LE(1, 20); // AudioFormat = 1 (PCM)
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28);
    buffer.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);
    buffer.writeUInt16LE(bitsPerSample, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);
    let brown = 0;
    let lp1 = 0;
    let lp2 = 0;
    for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        // Smooth loop envelope at start and end (1.2s fade in/out)
        const fadeSamples = Math.floor(sampleRate * 1.2);
        let env = 1.0;
        if (i < fadeSamples)
            env = i / fadeSamples;
        else if (i > numSamples - fadeSamples)
            env = (numSamples - i) / fadeSamples;
        let sample = 0;
        if (preset === 'forest_melody') {
            // Ethereal minor pad + gentle flute-like arpeggio (D Dorian: D4, F4, A4, C5, E5)
            const notes = [293.66, 349.23, 440.0, 523.25, 659.25, 523.25, 440.0, 349.23];
            const noteIdx = Math.floor(t * 1.5) % notes.length;
            const noteTime = (t * 1.5) % 1;
            const noteEnv = Math.sin(Math.PI * noteTime);
            const freq = notes[noteIdx];
            const pad = 0.22 * Math.sin(2 * Math.PI * 146.83 * t) +
                0.16 * Math.sin(2 * Math.PI * 220.0 * t) +
                0.12 * Math.sin(2 * Math.PI * 261.63 * t);
            const flute = 0.25 * noteEnv * (Math.sin(2 * Math.PI * freq * t) + 0.3 * Math.sin(4 * Math.PI * freq * t));
            sample = pad + flute;
        }
        else if (preset === 'battle_drums') {
            // Rhythmic war drums + tense brass-like fifths (E2 + B2 + pulse)
            const beat = (t * 2.5) % 1;
            const subBeat = (t * 5.0) % 1;
            const kickFreq = 55 + 90 * Math.exp(-beat * 18);
            const kick = 0.45 * Math.exp(-beat * 7) * Math.sin(2 * Math.PI * kickFreq * t);
            const tom = 0.22 * Math.exp(-subBeat * 12) * Math.sin(2 * Math.PI * 110 * t);
            const brass = 0.18 * Math.sin(2 * Math.PI * 82.41 * t + 0.6 * Math.sin(2 * Math.PI * 82.41 * t)) +
                0.14 * Math.sin(2 * Math.PI * 123.47 * t + 0.5 * Math.sin(2 * Math.PI * 123.47 * t));
            sample = kick + tom + brass;
        }
        else if (preset === 'tavern_lute') {
            // Warm acoustic plucked chords in G Mixolydian
            const chordProg = [
                [196.0, 246.94, 293.66, 392.0], // G
                [174.61, 220.0, 261.63, 349.23], // F
                [130.81, 164.81, 196.0, 261.63], // C
                [196.0, 246.94, 293.66, 392.0], // G
            ];
            const bar = Math.floor(t / 2) % chordProg.length;
            const chord = chordProg[bar];
            const pluckIdx = Math.floor(t * 4) % chord.length;
            const pluckPhase = (t * 4) % 1;
            const pluckEnv = Math.exp(-pluckPhase * 5.5);
            const f = chord[pluckIdx];
            const pluck = 0.35 *
                pluckEnv *
                (Math.sin(2 * Math.PI * f * t) +
                    0.45 * Math.sin(4 * Math.PI * f * t) +
                    0.2 * Math.sin(6 * Math.PI * f * t));
            const bass = 0.2 * Math.sin(2 * Math.PI * (chord[0] / 2) * t);
            sample = pluck + bass;
        }
        else if (preset === 'suspense_drone') {
            // Dark cinematic sub-drone + dissonant shimmer
            const lfo = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.18 * t);
            const drone1 = 0.28 * Math.sin(2 * Math.PI * 65.41 * t); // C2
            const drone2 = 0.22 * Math.sin(2 * Math.PI * 98.0 * t); // G2
            const tritone = 0.14 * lfo * Math.sin(2 * Math.PI * 185.0 * t); // F#3
            const highTension = 0.08 * Math.sin(2 * Math.PI * 311.13 * t + Math.sin(2 * Math.PI * 0.4 * t));
            sample = drone1 + drone2 + tritone + highTension;
        }
        else if (preset === 'rain_loop') {
            // Filtered pink/brown noise resembling steady rain
            const white = Math.random() * 2 - 1;
            brown = (brown + 0.04 * white) / 1.04;
            lp1 = lp1 + 0.18 * (white - lp1);
            const droplet = Math.random() > 0.9985 ? (Math.random() * 2 - 1) * 0.4 : 0;
            sample = 0.55 * brown + 0.22 * lp1 + droplet;
        }
        else if (preset === 'campfire_loop') {
            // Warm low rumble + gentle hearth crackles
            const white = Math.random() * 2 - 1;
            brown = (brown + 0.02 * white) / 1.02;
            const crackle = Math.random() > 0.996 ? (Math.random() * 2 - 1) * 0.65 : 0;
            lp2 = lp2 + 0.35 * (crackle - lp2);
            sample = 0.45 * brown + 0.8 * lp2;
        }
        else if (preset === 'ocean_loop') {
            // Slow sweeping wave noise (0.125 Hz wave cycle)
            const white = Math.random() * 2 - 1;
            brown = (brown + 0.03 * white) / 1.03;
            const waveLfo = 0.25 + 0.75 * Math.pow(0.5 + 0.5 * Math.sin(2 * Math.PI * 0.125 * t), 1.6);
            lp1 = lp1 + (0.04 + 0.12 * waveLfo) * (white - lp1);
            sample = waveLfo * (0.5 * brown + 0.28 * lp1);
        }
        const clamped = Math.max(-0.95, Math.min(0.95, sample * env));
        const intSample = Math.floor(clamped * 32767);
        buffer.writeInt16LE(intSample, 44 + i * 2);
    }
    return buffer;
}
