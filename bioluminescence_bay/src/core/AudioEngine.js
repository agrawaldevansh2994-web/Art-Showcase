// The sound of the coast.
//
// Three floors, three resident DJs. Each one runs its own procedural set through its own
// PannerNode, so the mix you hear is literally where you are standing: walk up over the
// headland and the beach falls away behind you. Drop a file on a floor and the synth
// steps aside for it — the spatialisation stays identical either way.
//
// On top of that sits ambience — the surf, which is the loudest thing in this world and
// is gated on your distance to the actual waterline, plus cicadas in the grove at night
// — a drum circle that only exists during the sunset ceremony, and one-shot SFX.

import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────
//  MUSICAL MATERIAL
// ─────────────────────────────────────────────────────────────

const MINOR = [0, 2, 3, 5, 7, 8, 10];
// The morning floor plays major. It is the one genuinely uplifting set on the coast and
// the scale is most of why — the same patterns in minor just sound like more night.
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

/** Set definitions — the personality of each floor lives here. */
const SETS = {
    // The cliff. Full-power night psytrance: rolling 16th offbeat bass under a hard
    // kick, a 303 running most of the time, and nothing melodic to hold on to.
    hilltop: {
        bpm: 145,
        root: 31,                                   // G1 — dark
        progression: [0, 0, -2, -5, 0, 0, -3, -7],
        kick: [0, 4, 8, 12],
        openHat: [6, 14],
        closedHat: [2, 3, 6, 7, 10, 11, 14, 15],
        bass: [-1, 0, 0, 0, -1, 0, 0, 2, -1, 0, 0, 0, -1, 0, 3, 0],
        bassOctave: 0,
        lead: [12, 15, 14, 12, 10, 12, 7, 10],
        leadEvery: 1,
        pad: { freqs: [0, 3, 7, 10, 14], type: 'sawtooth', gain: 0.022, cutoff: 440 },
        kickTone: { start: 182, end: 38, decay: 0.27, gain: 1.0 },
        acid: true,
        colour: 'cyan',
    },
    // The bowl. Melodic morning full-on — the floor that gets better as it gets light.
    discoValley: {
        bpm: 142,
        root: 33,                                   // A1
        scale: MAJOR,
        progression: [0, 0, 5, 3, 0, 0, 7, 5],      // 8-bar lift
        kick: [0, 4, 8, 12],
        openHat: [2, 6, 10, 14],
        closedHat: [1, 3, 5, 7, 9, 11, 13, 15],
        bass: [-1, 0, 0, 0, -1, 0, 0, 0, -1, 0, 0, 4, -1, 0, 0, 0],
        bassOctave: 0,
        lead: [7, 11, 14, 16, 14, 11, 9, 11],
        leadEvery: 1,
        pad: { freqs: [0, 4, 7, 11, 16], type: 'sawtooth', gain: 0.034, cutoff: 720 },
        kickTone: { start: 168, end: 44, decay: 0.32, gain: 0.95 },
        acid: false,
        colour: 'gold',
    },
    // Under the tree. Dub at half the tempo: no kick on the offbeats, a sub that sits
    // under everything, skank on the "and", and everything drenched in delay.
    banyan: {
        bpm: 88,
        root: 29,                                   // F1 — deep and slow
        progression: [0, 0, -4, -4, 0, 0, -2, -5],
        kick: [0, 8],
        openHat: [14],
        closedHat: [2, 6, 10, 14],                  // the offbeat skank
        bass: [0, -1, -1, -1, -1, -1, 3, -1, 0, -1, -1, -1, -1, -1, 5, -1],
        bassOctave: 0,
        lead: [12, -1, 10, -1, 7, -1, 10, 12],
        leadEvery: 2,
        pad: { freqs: [0, 3, 7, 10, 12], type: 'triangle', gain: 0.040, cutoff: 340 },
        kickTone: { start: 150, end: 34, decay: 0.46, gain: 1.0 },
        acid: false,
        glitch: true,
        colour: 'green',
    },
};

// ─────────────────────────────────────────────────────────────
//  ENGINE
// ─────────────────────────────────────────────────────────────

export function createAudioEngine() {
    let ctx = null;
    let master = null, compressor = null, limiter = null, masterAnalyser = null, masterData = null;
    let waterFilter = null;
    let started = false;
    let muted = false;
    let volume = 0.55;

    const stages = {};           // key → stage runtime
    const ambience = {};
    let schedulerId = null;

    // Energy readings handed to the visuals every frame.
    const silent = { bass: 0, mid: 0, treble: 0, level: 0 };

    // ── noise buffers, built once ──
    let whiteBuf = null, brownBuf = null;

    function buildNoiseBuffers() {
        const len = ctx.sampleRate * 2;
        whiteBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        const w = whiteBuf.getChannelData(0);
        for (let i = 0; i < len; i++) w[i] = Math.random() * 2 - 1;

        brownBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        const b = brownBuf.getChannelData(0);
        let last = 0;
        for (let i = 0; i < len; i++) {
            const white = Math.random() * 2 - 1;
            last = (last + 0.02 * white) / 1.02;
            b[i] = last * 3.2;
        }
    }

    // ─────────────────────────────────────────────
    //  INIT
    // ─────────────────────────────────────────────
    function init(stageDefs) {
        if (started) return;
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        buildNoiseBuffers();

        master = ctx.createGain();
        master.gain.value = volume;

        compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -14;
        compressor.knee.value = 22;
        compressor.ratio.value = 4.5;
        compressor.attack.value = 0.004;
        compressor.release.value = 0.22;

        // A gentle safety cap after the bus compressor, well above where it should
        // normally engage — see the note on fileGain in startStageFile() for why: the
        // real fix for "static that gets worse as the uploaded track's BPM/density goes
        // up" was pre-attenuating file playback, not adding more dynamics processing
        // here. Two DynamicsCompressorNodes in series, each independently chasing a
        // dense, fast stream of transients (busier at higher BPM), fight each other's
        // gain envelopes — their attack/release curves overlap and beat against one
        // another, which is audible as exactly the "static that increases with BPM"
        // that was reported. Kept slow/high-threshold so it almost never actually acts.
        limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -0.5;
        limiter.knee.value = 6;
        limiter.ratio.value = 3;
        limiter.attack.value = 0.006;
        limiter.release.value = 0.25;

        masterAnalyser = ctx.createAnalyser();
        masterAnalyser.fftSize = 512;
        masterAnalyser.smoothingTimeConstant = 0.72;
        masterData = new Uint8Array(masterAnalyser.frequencyBinCount);

        // Everything runs through one lowpass so that going under the water can muffle
        // the entire world in a single parameter, music and ambience alike.
        waterFilter = ctx.createBiquadFilter();
        waterFilter.type = 'lowpass';
        waterFilter.frequency.value = 20000;
        waterFilter.Q.value = 0.6;

        master.connect(waterFilter);
        waterFilter.connect(compressor);
        compressor.connect(limiter);
        limiter.connect(masterAnalyser);
        masterAnalyser.connect(ctx.destination);

        stageDefs.forEach(def => createStage(def));
        createAmbience();

        started = true;
        schedulerId = setInterval(schedule, 25);
    }

    function resume() {
        if (ctx && ctx.state === 'suspended') ctx.resume();
    }

    // ─────────────────────────────────────────────
    //  STAGE CONSTRUCTION
    // ─────────────────────────────────────────────
    function createStage(def) {
        const set = SETS[def.setKey] || SETS.hilltop;

        // Distance model matters more than it looks. 'linear' barely attenuates near the
        // source and only reaches silence at maxDistance — with the two main stages 320
        // units apart and maxDistance set to 320-340, both floors sat at roughly 60% in
        // the middle of the valley and the two sets audibly fought each other.
        // 'exponential' falls off properly, so whichever floor you are standing on
        // dominates and the other reads as a distant thump the way it should.
        // (maxDistance is not used by the exponential model — tune with rolloff instead.)
        const panner = ctx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'exponential';
        panner.refDistance = def.refDistance;
        panner.rolloffFactor = def.rolloff ?? 1.6;
        setNodePosition(panner, def.x, def.y ?? 6, def.z);
        panner.connect(master);

        const gain = ctx.createGain();
        gain.gain.value = def.gain ?? 1;
        gain.connect(panner);

        // Per-stage analyser so each stage's lights react to its own music.
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.68;
        gain.connect(analyser);

        const synthGain = ctx.createGain();
        synthGain.gain.value = 1;
        synthGain.connect(gain);

        const fileGain = ctx.createGain();
        fileGain.gain.value = 0;
        fileGain.connect(gain);

        const stage = {
            def, set, panner, gain, analyser, synthGain, fileGain,
            data: new Uint8Array(analyser.frequencyBinCount),
            energy: { bass: 0, mid: 0, treble: 0, level: 0 },
            beat: 0, nextNote: 0, bar: 0,
            usingFile: false, fileSource: null, fileEl: null, fileUrl: null,
            intensity: 1, riserActive: false,
            padNodes: [],
        };

        if (set.pad) startPad(stage);
        stages[def.key] = stage;
        return stage;
    }

    function setNodePosition(node, x, y, z) {
        if (node.positionX) {
            node.positionX.value = x; node.positionY.value = y; node.positionZ.value = z;
        } else if (node.setPosition) {
            node.setPosition(x, y, z);
        }
    }

    // ─────────────────────────────────────────────
    //  VOICES
    // ─────────────────────────────────────────────
    function kick(stage, time) {
        const k = stage.set.kickTone;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.setValueAtTime(k.start, time);
        o.frequency.exponentialRampToValueAtTime(k.end, time + 0.09);
        g.gain.setValueAtTime(k.gain, time);
        g.gain.exponentialRampToValueAtTime(0.001, time + k.decay);
        o.connect(g); g.connect(stage.synthGain);
        o.start(time); o.stop(time + k.decay + 0.02);

        // Click transient so it cuts through on small speakers.
        const c = ctx.createBufferSource();
        c.buffer = whiteBuf;
        const cf = ctx.createBiquadFilter();
        cf.type = 'bandpass'; cf.frequency.value = 1800; cf.Q.value = 0.9;
        const cg = ctx.createGain();
        cg.gain.setValueAtTime(0.18, time);
        cg.gain.exponentialRampToValueAtTime(0.001, time + 0.02);
        c.connect(cf); cf.connect(cg); cg.connect(stage.synthGain);
        c.start(time); c.stop(time + 0.03);
    }

    function hat(stage, time, open) {
        const len = open ? 0.15 : 0.045;
        const s = ctx.createBufferSource();
        s.buffer = whiteBuf;
        s.playbackRate.value = 1.4;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass'; hp.frequency.value = open ? 7200 : 8600;
        const g = ctx.createGain();
        g.gain.setValueAtTime(open ? 0.11 : 0.075, time);
        g.gain.exponentialRampToValueAtTime(0.001, time + len);
        s.connect(hp); hp.connect(g); g.connect(stage.synthGain);
        s.start(time); s.stop(time + len + 0.02);
    }

    function bassNote(stage, time, freq, dur) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = freq;
        const sub = ctx.createOscillator();
        sub.type = 'sine';
        sub.frequency.value = freq * 0.5;

        const f = ctx.createBiquadFilter();
        f.type = 'lowpass'; f.Q.value = 11;
        const peak = 900 + stage.intensity * 700;
        f.frequency.setValueAtTime(160, time);
        f.frequency.linearRampToValueAtTime(peak, time + dur * 0.16);
        f.frequency.exponentialRampToValueAtTime(200, time + dur);

        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, time);
        g.gain.linearRampToValueAtTime(0.21, time + 0.008);
        g.gain.setValueAtTime(0.21, time + dur * 0.8);
        g.gain.exponentialRampToValueAtTime(0.001, time + dur);

        const sg = ctx.createGain();
        sg.gain.setValueAtTime(0.12, time);
        sg.gain.exponentialRampToValueAtTime(0.001, time + dur);

        o.connect(f); f.connect(g); g.connect(stage.synthGain);
        sub.connect(sg); sg.connect(stage.synthGain);
        o.start(time); o.stop(time + dur + 0.02);
        sub.start(time); sub.stop(time + dur + 0.02);
    }

    function acidNote(stage, time, freq, dur) {
        const o = ctx.createOscillator();
        o.type = 'square';
        o.frequency.value = freq;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass'; f.Q.value = 17;
        const open = 700 + Math.random() * 2600 * stage.intensity;
        f.frequency.setValueAtTime(320, time);
        f.frequency.exponentialRampToValueAtTime(open, time + dur * 0.25);
        f.frequency.exponentialRampToValueAtTime(280, time + dur);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, time);
        g.gain.linearRampToValueAtTime(0.085, time + 0.006);
        g.gain.exponentialRampToValueAtTime(0.001, time + dur);
        o.connect(f); f.connect(g); g.connect(stage.synthGain);
        o.start(time); o.stop(time + dur + 0.02);
    }

    function pluck(stage, time, freq, dur) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = freq;
        const o2 = ctx.createOscillator();
        o2.type = 'sawtooth';
        o2.frequency.value = freq * 1.005;

        const f = ctx.createBiquadFilter();
        f.type = 'lowpass'; f.Q.value = 4;
        f.frequency.setValueAtTime(5200, time);
        f.frequency.exponentialRampToValueAtTime(700, time + dur);

        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, time);
        g.gain.linearRampToValueAtTime(0.062 * stage.intensity, time + 0.006);
        g.gain.exponentialRampToValueAtTime(0.001, time + dur);

        // A short slap delay makes eight notes sound like a whole melody.
        const delay = ctx.createDelay(1.0);
        delay.delayTime.value = (60 / stage.set.bpm) * 0.75;
        const fb = ctx.createGain();
        fb.gain.value = 0.34;
        const wet = ctx.createGain();
        wet.gain.value = 0.42;

        o.connect(f); o2.connect(f); f.connect(g);
        g.connect(stage.synthGain);
        g.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet);
        wet.connect(stage.synthGain);

        o.start(time); o.stop(time + dur + 0.02);
        o2.start(time); o2.stop(time + dur + 0.02);
    }

    function blip(stage, time) {
        const o = ctx.createOscillator();
        o.type = 'square';
        const base = 700 + Math.random() * 2400;
        o.frequency.setValueAtTime(base, time);
        o.frequency.exponentialRampToValueAtTime(base * (Math.random() > 0.5 ? 3 : 0.35), time + 0.07);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.05, time);
        g.gain.exponentialRampToValueAtTime(0.001, time + 0.09);
        o.connect(g); g.connect(stage.synthGain);
        o.start(time); o.stop(time + 0.1);
    }

    function clap(stage, time) {
        for (let i = 0; i < 3; i++) {
            const t = time + i * 0.011;
            const s = ctx.createBufferSource();
            s.buffer = whiteBuf;
            const bp = ctx.createBiquadFilter();
            bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 1.6;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.13, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
            s.connect(bp); bp.connect(g); g.connect(stage.synthGain);
            s.start(t); s.stop(t + 0.15);
        }
    }

    function riser(stage, time, dur) {
        const s = ctx.createBufferSource();
        s.buffer = whiteBuf;
        s.loop = true;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.Q.value = 5;
        bp.frequency.setValueAtTime(400, time);
        bp.frequency.exponentialRampToValueAtTime(9000, time + dur);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, time);
        g.gain.exponentialRampToValueAtTime(0.16, time + dur * 0.92);
        g.gain.exponentialRampToValueAtTime(0.0001, time + dur + 0.12);
        s.connect(bp); bp.connect(g); g.connect(stage.synthGain);
        s.start(time); s.stop(time + dur + 0.2);
    }

    // ── The drum circle ──
    // Only exists while the sunset ceremony is running. Hand drums, not a drum machine:
    // pitched membrane tones with a bit of humanised timing, played into their own gain
    // so they sit on top of whatever floor you happen to be within earshot of.
    let drumGain = null;
    const drumCircle = { active: false, nextNote: 0, beat: 0 };
    const DJEMBE = [
        // step, tone: 0 = bass, 1 = tone, 2 = slap
        0, 2, 1, 2, 0, -1, 1, 2, 0, 2, 1, -1, 0, 1, 2, 2,
    ];

    function djembe(time, tone) {
        const base = [92, 190, 340][tone];
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(base * 1.5, time);
        o.frequency.exponentialRampToValueAtTime(base, time + 0.05);
        const g = ctx.createGain();
        const amp = [0.30, 0.19, 0.13][tone];
        g.gain.setValueAtTime(amp, time);
        g.gain.exponentialRampToValueAtTime(0.001, time + [0.34, 0.20, 0.12][tone]);
        o.connect(g); g.connect(drumGain);
        o.start(time); o.stop(time + 0.4);

        // The skin. This is what makes it a hand drum rather than a tom.
        const n = ctx.createBufferSource();
        n.buffer = whiteBuf;
        n.playbackRate.value = 0.8 + tone * 0.7;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 900 + tone * 2400;
        bp.Q.value = 0.9;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.05 + tone * 0.05, time);
        ng.gain.exponentialRampToValueAtTime(0.0004, time + 0.07 + tone * 0.03);
        n.connect(bp); bp.connect(ng); ng.connect(drumGain);
        n.start(time); n.stop(time + 0.14);
    }

    function scheduleDrums(now, lookahead) {
        if (!drumCircle.active || !drumGain) return;
        const step = (60 / 104) / 4;
        if (drumCircle.nextNote === 0) drumCircle.nextNote = now + 0.12;
        while (drumCircle.nextNote < now + lookahead) {
            const t = drumCircle.nextNote;
            const s16 = drumCircle.beat % 16;
            const tone = DJEMBE[s16];
            // Six people around a fire never hit exactly together, and it matters.
            if (tone >= 0) {
                const players = 3 + Math.floor(Math.random() * 3);
                for (let p = 0; p < players; p++) {
                    djembe(t + (Math.random() - 0.5) * 0.022, tone);
                }
            }
            drumCircle.nextNote += step;
            drumCircle.beat++;
        }
    }

    function startPad(stage) {
        const cfgPad = stage.set.pad;
        cfgPad.freqs.forEach((semi, i) => {
            const o = ctx.createOscillator();
            o.type = cfgPad.type;
            o.frequency.value = midiToHz(stage.set.root + 24 + semi);
            o.detune.value = (i - 2) * 7;

            const f = ctx.createBiquadFilter();
            f.type = 'lowpass';
            f.frequency.value = cfgPad.cutoff;
            f.Q.value = 1.4;

            const g = ctx.createGain();
            g.gain.value = cfgPad.gain;

            const lfo = ctx.createOscillator();
            lfo.frequency.value = 0.06 + Math.random() * 0.13;
            const lfoGain = ctx.createGain();
            lfoGain.gain.value = cfgPad.cutoff * 0.45;
            lfo.connect(lfoGain); lfoGain.connect(f.frequency);

            o.connect(f); f.connect(g); g.connect(stage.synthGain);
            o.start(); lfo.start();
            stage.padNodes.push({ o, g, f, lfo });
        });
    }

    // ─────────────────────────────────────────────
    //  SEQUENCER
    // ─────────────────────────────────────────────
    function schedule() {
        if (!started || ctx.state !== 'running') return;
        const now = ctx.currentTime;
        const lookahead = 0.16;

        for (const key in stages) {
            const stage = stages[key];
            if (stage.usingFile) continue;

            const set = stage.set;
            const step = (60 / set.bpm) / 4;         // 16th note
            if (stage.nextNote === 0) stage.nextNote = now + 0.12;

            while (stage.nextNote < now + lookahead) {
                const t = stage.nextNote;
                const s16 = stage.beat % 16;
                if (s16 === 0) {
                    stage.bar++;
                    // A 32-bar arc: eight bars of breakdown, a riser, then full power.
                    const phase = stage.bar % 32;
                    if (phase === 0) stage.intensity = 0.45;
                    else if (phase === 8) stage.intensity = 0.7;
                    else if (phase === 12) { stage.intensity = 0.85; riser(stage, t, step * 16 * 4); }
                    else if (phase === 16) stage.intensity = 1.25;
                    else if (phase === 24) stage.intensity = 1.0;
                }

                const chordStep = set.progression[Math.floor(stage.bar / 1) % set.progression.length];
                const inBreakdown = stage.intensity < 0.6;

                if (!inBreakdown && set.kick.includes(s16)) kick(stage, t);
                if (set.closedHat.includes(s16) && stage.intensity > 0.5) hat(stage, t, false);
                if (set.openHat.includes(s16)) hat(stage, t, true);
                if ((s16 === 4 || s16 === 12) && stage.intensity > 0.9) clap(stage, t);

                const scale = set.scale || MINOR;

                const deg = set.bass[s16];
                if (deg >= 0 && !inBreakdown) {
                    const semi = scale[deg % 7] + Math.floor(deg / 7) * 12;
                    bassNote(stage, t, midiToHz(set.root + chordStep + semi + set.bassOctave * 12), step * 1.8);
                }

                if (set.acid && s16 % 2 === 1 && stage.intensity > 0.8 && Math.random() > 0.45) {
                    const d = scale[Math.floor(Math.random() * 7)];
                    acidNote(stage, t, midiToHz(set.root + 12 + chordStep + d), step * 1.4);
                }

                if (s16 % 4 === 0 && (stage.bar % set.leadEvery === 0)) {
                    const idx = Math.floor(stage.bar * 4 + s16 / 4) % set.lead.length;
                    const semi = set.lead[idx];
                    if (semi >= 0) pluck(stage, t, midiToHz(set.root + 24 + chordStep + semi), step * 3);
                }

                if (set.glitch && Math.random() > 0.88) blip(stage, t);

                // Pad follows the progression and opens up with intensity.
                if (s16 === 0 && stage.padNodes.length) {
                    stage.padNodes.forEach((p, i) => {
                        const semi = set.pad.freqs[i];
                        p.o.frequency.setTargetAtTime(
                            midiToHz(set.root + 24 + chordStep + semi), t, 0.25);
                        p.g.gain.setTargetAtTime(set.pad.gain * (0.5 + stage.intensity * 0.6), t, 0.4);
                    });
                }

                stage.nextNote += step;
                stage.beat++;
            }
        }

        scheduleDrums(now, lookahead);
    }

    // ─────────────────────────────────────────────
    //  FILE PLAYBACK
    // ─────────────────────────────────────────────
    // Routed through an <audio> element + MediaElementSource rather than
    // decodeAudioData/AudioBufferSourceNode. decodeAudioData uses a stricter decode
    // path than the browser's normal media pipeline, and some real-world MP3/AAC
    // encodings (odd VBR headers, certain encoders) come out of it as corrupted,
    // static-laced noise even though the same file plays fine anywhere else. The
    // <audio> element uses the same tolerant decoder the browser already plays any
    // other media with, so the exact same file plays clean through it.
    async function loadStageFile(key, file) {
        if (!ctx) return false;
        const stage = stages[key];
        if (!stage) return false;
        const url = URL.createObjectURL(file);
        startStageFile(stage, url);
        return true;
    }

    function startStageFile(stage, url) {
        if (stage.fileSource) { try { stage.fileSource.disconnect(); } catch (e) { /* already gone */ } }
        if (stage.fileEl) { try { stage.fileEl.pause(); stage.fileEl.src = ''; } catch (e) { /* already gone */ } }
        if (stage.fileUrl) URL.revokeObjectURL(stage.fileUrl);

        const el = new Audio();
        el.loop = true;
        el.src = url;
        const src = ctx.createMediaElementSource(el);
        src.connect(stage.fileGain);
        el.play();

        stage.fileEl = el;
        stage.fileSource = src;
        stage.fileUrl = url;
        stage.usingFile = true;
        stage.synthGain.gain.setTargetAtTime(0, ctx.currentTime, 0.7);
        // 0.42 (~ -7.5dB), not unity. The procedural sets this replaces were hand
        // gain-staged very quiet (bass/pad peaks ~0.02-0.04), so the bus compressor
        // downstream (threshold -14dB) almost never had to react to them. A real
        // uploaded track is normally mastered near 0dBFS — at gain 1 it sat well above
        // that threshold continuously, so the compressor was constantly chasing every
        // kick/hat. The denser the track (higher BPM = transients closer together),
        // the more often its attack/release windows overlapped, and the audible result
        // was exactly the "static that gets worse as BPM increases" that was reported.
        // Pulling the source down so it mostly sits under the threshold means the
        // compressor mostly stays at unity gain instead of riding every transient.
        stage.fileGain.gain.setTargetAtTime(0.42, ctx.currentTime, 0.7);
        stage.padNodes.forEach(p => p.g.gain.setTargetAtTime(0, ctx.currentTime, 0.7));
    }

    // ─────────────────────────────────────────────
    //  AMBIENCE
    // ─────────────────────────────────────────────
    function createAmbience() {
        // All the noise-buffer ambience beds that used to live here — the surf roar/hiss,
        // the brown-noise sea breeze, and the cicada band — have been removed entirely.
        // They were filtered white/brown noise and read as a constant static hiss under
        // the whole world. What is left is deliberately only "genuine" sound: the music,
        // the gated drum circle, and the enveloped one-shot SFX (gull, splash, conch,
        // footstep). If any wash is ever wanted back, build it as short enveloped
        // one-shots, never an always-on noise source.

        // ── The drum circle's own bus ──
        drumGain = ctx.createGain();
        drumGain.gain.value = 0;
        drumGain.connect(master);
    }

    // ─────────────────────────────────────────────
    //  ONE-SHOT SFX
    // ─────────────────────────────────────────────
    function sfx(name, opts = {}) {
        if (!started || !ctx) return;
        const t = ctx.currentTime;
        const out = ctx.createGain();
        out.gain.value = opts.gain ?? 0.5;
        out.connect(master);

        if (name === 'horn') {
            [520, 660].forEach((f, i) => {
                const o = ctx.createOscillator();
                o.type = 'sawtooth'; o.frequency.value = f;
                const lp = ctx.createBiquadFilter();
                lp.type = 'lowpass'; lp.frequency.value = 1600;
                const g = ctx.createGain();
                g.gain.setValueAtTime(0.0001, t);
                g.gain.linearRampToValueAtTime(0.22, t + 0.03);
                g.gain.setValueAtTime(0.22, t + 0.4);
                g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
                o.connect(lp); lp.connect(g); g.connect(out);
                o.start(t + i * 0.01); o.stop(t + 0.6);
            });
        } else if (name === 'bell') {
            [1180, 1770, 2360].forEach((f, i) => {
                const o = ctx.createOscillator();
                o.type = 'sine'; o.frequency.value = f;
                const g = ctx.createGain();
                g.gain.setValueAtTime(0.16 / (i + 1), t);
                g.gain.exponentialRampToValueAtTime(0.0005, t + 1.6 + i * 0.4);
                o.connect(g); g.connect(out);
                o.start(t); o.stop(t + 2.4);
            });
        } else if (name === 'gong') {
            [96, 143, 217, 288, 401].forEach((f, i) => {
                const o = ctx.createOscillator();
                o.type = i < 2 ? 'sine' : 'triangle';
                o.frequency.value = f * (1 + Math.random() * 0.006);
                const g = ctx.createGain();
                g.gain.setValueAtTime(0.0001, t);
                g.gain.linearRampToValueAtTime(0.22 / (i * 0.55 + 1), t + 0.02);
                g.gain.exponentialRampToValueAtTime(0.0004, t + 7 - i * 0.7);
                o.connect(g); g.connect(out);
                o.start(t); o.stop(t + 8);
            });
            const n = ctx.createBufferSource();
            n.buffer = whiteBuf;
            const nf = ctx.createBiquadFilter();
            nf.type = 'bandpass'; nf.frequency.value = 2600; nf.Q.value = 0.8;
            const ng = ctx.createGain();
            ng.gain.setValueAtTime(0.14, t);
            ng.gain.exponentialRampToValueAtTime(0.0005, t + 1.1);
            n.connect(nf); nf.connect(ng); ng.connect(out);
            n.start(t); n.stop(t + 1.3);
        } else if (name === 'chime') {
            const base = 900 + Math.random() * 500;
            [1, 1.5, 2.02].forEach((m, i) => {
                const o = ctx.createOscillator();
                o.type = 'sine'; o.frequency.value = base * m;
                const g = ctx.createGain();
                g.gain.setValueAtTime(0.09 / (i + 1), t);
                g.gain.exponentialRampToValueAtTime(0.0004, t + 1.1);
                o.connect(g); g.connect(out);
                o.start(t); o.stop(t + 1.3);
            });
        } else if (name === 'pour') {
            const s = ctx.createBufferSource();
            s.buffer = whiteBuf;
            const bp = ctx.createBiquadFilter();
            bp.type = 'bandpass'; bp.Q.value = 3;
            bp.frequency.setValueAtTime(1100, t);
            bp.frequency.linearRampToValueAtTime(2600, t + 1.1);
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(0.09, t + 0.12);
            g.gain.exponentialRampToValueAtTime(0.0005, t + 1.3);
            s.connect(bp); bp.connect(g); g.connect(out);
            s.start(t); s.stop(t + 1.4);
        } else if (name === 'step') {
            // Sand, not gravel: duller, softer and a touch longer than a footfall on
            // rock. This is the sound you hear more than any other in this world.
            const s = ctx.createBufferSource();
            s.buffer = whiteBuf;
            s.playbackRate.value = 0.55 + Math.random() * 0.5;
            const bp = ctx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.frequency.value = 820 + Math.random() * 700;
            bp.Q.value = 0.85;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.06, t);
            g.gain.exponentialRampToValueAtTime(0.0005, t + 0.095);
            s.connect(bp); bp.connect(g); g.connect(out);
            s.start(t); s.stop(t + 0.1);
        } else if (name === 'splash') {
            // A short bright burst that closes down fast, plus one low "gloop".
            const s = ctx.createBufferSource();
            s.buffer = whiteBuf;
            s.playbackRate.value = 0.9 + Math.random() * 0.5;
            const bp = ctx.createBiquadFilter();
            bp.type = 'bandpass'; bp.Q.value = 0.8;
            bp.frequency.setValueAtTime(3200 + Math.random() * 1600, t);
            bp.frequency.exponentialRampToValueAtTime(500, t + 0.32);
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.16, t);
            g.gain.exponentialRampToValueAtTime(0.0005, t + 0.34);
            s.connect(bp); bp.connect(g); g.connect(out);
            s.start(t); s.stop(t + 0.4);

            const o = ctx.createOscillator();
            o.type = 'sine';
            o.frequency.setValueAtTime(320, t);
            o.frequency.exponentialRampToValueAtTime(110, t + 0.14);
            const og = ctx.createGain();
            og.gain.setValueAtTime(0.09, t);
            og.gain.exponentialRampToValueAtTime(0.0005, t + 0.2);
            o.connect(og); og.connect(out);
            o.start(t); o.stop(t + 0.24);
        } else if (name === 'conch') {
            // Blown, not struck: it takes a moment to speak and it wobbles.
            [148, 296, 444, 592].forEach((f, i) => {
                const o = ctx.createOscillator();
                o.type = i === 0 ? 'sawtooth' : 'sine';
                o.frequency.setValueAtTime(f * 0.97, t);
                o.frequency.linearRampToValueAtTime(f, t + 0.35);
                const lfo = ctx.createOscillator();
                lfo.frequency.value = 5.2;
                const lfoG = ctx.createGain();
                lfoG.gain.value = f * 0.006;
                lfo.connect(lfoG); lfoG.connect(o.frequency);
                const g = ctx.createGain();
                g.gain.setValueAtTime(0.0001, t);
                g.gain.linearRampToValueAtTime(0.15 / (i * 0.8 + 1), t + 0.3);
                g.gain.setValueAtTime(0.15 / (i * 0.8 + 1), t + 1.9);
                g.gain.exponentialRampToValueAtTime(0.0004, t + 2.9);
                o.connect(g); g.connect(out);
                o.start(t); o.stop(t + 3.0);
                lfo.start(t); lfo.stop(t + 3.0);
            });
        } else if (name === 'gull') {
            for (let i = 0; i < 2; i++) {
                const st = t + i * 0.28;
                const o = ctx.createOscillator();
                o.type = 'sawtooth';
                o.frequency.setValueAtTime(1500 + Math.random() * 400, st);
                o.frequency.exponentialRampToValueAtTime(680, st + 0.22);
                const bp = ctx.createBiquadFilter();
                bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 2.4;
                const g = ctx.createGain();
                g.gain.setValueAtTime(0.0001, st);
                g.gain.linearRampToValueAtTime(0.075, st + 0.03);
                g.gain.exponentialRampToValueAtTime(0.0004, st + 0.26);
                o.connect(bp); bp.connect(g); g.connect(out);
                o.start(st); o.stop(st + 0.3);
            }
        } else if (name === 'whoosh') {
            const s = ctx.createBufferSource();
            s.buffer = brownBuf;
            const bp = ctx.createBiquadFilter();
            bp.type = 'bandpass'; bp.Q.value = 1.6;
            bp.frequency.setValueAtTime(260, t);
            bp.frequency.exponentialRampToValueAtTime(2200, t + 0.5);
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(0.2, t + 0.18);
            g.gain.exponentialRampToValueAtTime(0.0005, t + 0.9);
            s.connect(bp); bp.connect(g); g.connect(out);
            s.start(t); s.stop(t + 1);
        }
    }

    // ─────────────────────────────────────────────
    //  PER-FRAME UPDATE
    // ─────────────────────────────────────────────
    function readEnergy(analyser, data, out) {
        analyser.getByteFrequencyData(data);
        const n = data.length;
        const bEnd = Math.max(1, Math.floor(n * 0.09));
        const mEnd = Math.floor(n * 0.42);
        let b = 0, m = 0, tr = 0;
        for (let i = 0; i < bEnd; i++) b += data[i];
        for (let i = bEnd; i < mEnd; i++) m += data[i];
        for (let i = mEnd; i < n; i++) tr += data[i];
        out.bass = b / (bEnd * 255);
        out.mid = m / ((mEnd - bEnd) * 255);
        out.treble = tr / ((n - mEnd) * 255);
        out.level = (out.bass + out.mid + out.treble) / 3;
        return out;
    }

    const _dirVec = new THREE.Vector3(0, 0, -1);
    const globalEnergy = { bass: 0, mid: 0, treble: 0, level: 0 };

    /**
     * @param nightLevel 0..1 from SkyCycle — accepted for API compatibility (unused now)
     * @param submerged  0..1 how far under the water the camera is
     */
    function update(camera, delta, weather, nightLevel = 0, submerged = 0) {
        if (!started || !ctx || ctx.state !== 'running') return;

        // Listener follows the player, so the whole mix pans as you turn your head.
        const L = ctx.listener;
        const p = camera.position;
        camera.getWorldDirection(_dirVec);
        if (L.positionX) {
            L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z;
            L.forwardX.value = _dirVec.x; L.forwardY.value = _dirVec.y; L.forwardZ.value = _dirVec.z;
            L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
        } else if (L.setPosition) {
            L.setPosition(p.x, p.y, p.z);
            L.setOrientation(_dirVec.x, _dirVec.y, _dirVec.z, 0, 1, 0);
        }

        for (const key in stages) {
            const s = stages[key];
            readEnergy(s.analyser, s.data, s.energy);
        }
        readEnergy(masterAnalyser, masterData, globalEnergy);

        // Banyan isolation. Distance rolloff alone is not enough: Hilltop is only ~135
        // units away and its own refDistance/rolloff are tuned for the open beach, so it
        // still bleeds into the grove as "something from the cliff". The banyan is meant
        // to be its own world once you find it, so fade every OTHER floor's pre-panner
        // gain out over the last stretch of the trail (~70 units out, silent by ~22)
        // rather than relying on physical falloff to hide them.
        const banyanStage = stages.banyan;
        if (banyanStage) {
            const dx = p.x - banyanStage.def.x, dz = p.z - banyanStage.def.z;
            const distToBanyan = Math.hypot(dx, dz);
            const isolation = 1 - THREE.MathUtils.smoothstep(distToBanyan, 22, 70);
            for (const key in stages) {
                if (key === 'banyan') continue;
                const s = stages[key];
                s.gain.gain.setTargetAtTime(s.def.gain * (1 - isolation), ctx.currentTime, 0.8);
            }
        }

        // (All noise-buffer ambience beds — surf, sea breeze, cicadas — removed. See
        // createAmbience. nightLevel/weather are still accepted for API compatibility.)

        // ── Underwater ──
        // One filter, the whole mix. 380 Hz is about where a swimming pool sits.
        if (waterFilter) {
            waterFilter.frequency.setTargetAtTime(
                20000 - submerged * 19620, ctx.currentTime, 0.12);
        }

        // ── Drum circle ──
        if (drumGain) {
            drumGain.gain.setTargetAtTime(drumCircle.active ? 0.62 : 0, ctx.currentTime, 1.1);
        }
    }

    // ─────────────────────────────────────────────
    //  PUBLIC
    // ─────────────────────────────────────────────
    return {
        init, resume, sfx, update, loadStageFile,
        isStarted: () => started,
        /** Starts/stops the djembe circle that plays over the sunset ceremony. */
        setDrumCircle(on) {
            drumCircle.active = !!on;
            if (on) { drumCircle.nextNote = 0; drumCircle.beat = 0; }
        },
        getStageEnergy: (key) => (stages[key] ? stages[key].energy : silent),
        getEnergy: () => (started ? globalEnergy : silent),
        getStageIntensity: (key) => (stages[key] ? stages[key].intensity : 0),
        stageUsesFile: (key) => !!(stages[key] && stages[key].usingFile),
        setVolume(v) {
            volume = v;
            if (master && !muted) master.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
        },
        toggleMute() {
            muted = !muted;
            if (master) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.05);
            return muted;
        },
        isMuted: () => muted,
        dispose() {
            if (schedulerId) clearInterval(schedulerId);
            if (ctx) ctx.close();
        },
    };
}
