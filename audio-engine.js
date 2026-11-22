/**
 * 戏曲锣鼓 - Web Audio API 物理建模合成音频引擎
 * 零外部依赖，低延迟多音复音，支持长尾止音（Choke）与戏台混响
 */
(function (global) {
  'use strict';

  const INSTRUMENTS = [
    // 锣类
    { id: 'daluo', name: '大锣', category: '锣类', short: '大锣', desc: '洪亮下行滑音大锣，戏曲核心「仓」音', tailGroup: 'metal' },
    { id: 'daluo_soft', name: '闷大锣', category: '锣类', short: '闷锣', desc: '轻击或按音大锣，余音收敛', tailGroup: 'metal' },
    { id: 'xiaoluo', name: '小锣', category: '锣类', short: '小锣', desc: '清脆上行滑音小锣，经典「台」音', tailGroup: 'metal' },
    { id: 'fengluo', name: '风锣', category: '锣类', short: '风锣', desc: '浑厚绵长震荡风锣，用于气氛烘托', tailGroup: 'metal' },
    { id: 'dangzi', name: '铛子', category: '锣类', short: '铛子', desc: '清亮高音铜铛，短促明快', tailGroup: 'metal' },

    // 钹类
    { id: 'naobo', name: '铙钹', category: '钹类', short: '铙钹', desc: '明亮穿透金属炸音，经典「才」音', tailGroup: 'metal' },
    { id: 'naobo_choke', name: '闷钹', category: '钹类', short: '闷钹', desc: '合击止音「扑」声，干脆利落', tailGroup: 'none' },
    { id: 'xiaobo', name: '小钹', category: '钹类', short: '小钹', desc: '高亢紧凑小铜钹，常用于「七」音', tailGroup: 'metal' },
    { id: 'guangbo', name: '广钹', category: '钹类', short: '广钹', desc: '宽厚低沉大铜钹，声场饱满', tailGroup: 'metal' },

    // 鼓类
    { id: 'bangu', name: '板鼓(单皮)', category: '鼓类', short: '板鼓', desc: '武场指挥核心，高脆紧绷「单/笃」音', tailGroup: 'none' },
    { id: 'bangu_rim', name: '鼓边(撕边)', category: '鼓类', short: '鼓边', desc: '敲击板鼓木框的清脆「撕」音', tailGroup: 'none' },
    { id: 'datanggu', name: '大堂鼓', category: '鼓类', short: '大堂鼓', desc: '浑厚震撼「咚」音，用于武打与冲头', tailGroup: 'drum' },
    { id: 'xiaotanggu', name: '小堂鼓', category: '鼓类', short: '小堂鼓', desc: '紧实明快「冬」音，节奏灵动', tailGroup: 'drum' },

    // 板与法器类
    { id: 'ban', name: '檀板', category: '板/击节', short: '檀板', desc: '硬木拍板「板」音，用于定强拍', tailGroup: 'none' },
    { id: 'bangzi', name: '梆子', category: '板/击节', short: '梆子', desc: '空心硬木「梆」音，清越干脆', tailGroup: 'none' },
    { id: 'muyu', name: '木鱼', category: '板/击节', short: '木鱼', desc: '空灵圆润木质敲击声', tailGroup: 'none' },
    { id: 'pengling', name: '碰铃', category: '板/击节', short: '碰铃', desc: '晶莹高音铜铃「叮」声，余韵清长', tailGroup: 'metal' },
    { id: 'yinqing', name: '引磬', category: '板/击节', short: '引磬', desc: '清澈悠远小磬音', tailGroup: 'metal' }
  ];

  const INSTRUMENT_MAP = {};
  INSTRUMENTS.forEach(function (inst) {
    INSTRUMENT_MAP[inst.id] = inst;
  });

  class OperaAudioEngine {
    constructor() {
      this.ctx = null;
      this.masterGain = null;
      this.compressor = null;
      this.dryGain = null;
      this.wetGain = null;
      this.convolver = null;
      this.noiseBuffer = null;
      this.masterVolume = 0.85;
      this.reverbMode = 'room'; // 'dry' | 'room' | 'stage'
      this.activeVoices = [];
    }

    ensureContext() {
      if (!this.ctx) {
        const AudioCtx = global.AudioContext || global.webkitAudioContext;
        this.ctx = new AudioCtx({ latencyHint: 'interactive' });

        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.setValueAtTime(-8, this.ctx.currentTime);
        this.compressor.knee.setValueAtTime(12, this.ctx.currentTime);
        this.compressor.ratio.setValueAtTime(6, this.ctx.currentTime);
        this.compressor.attack.setValueAtTime(0.002, this.ctx.currentTime);
        this.compressor.release.setValueAtTime(0.12, this.ctx.currentTime);

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);

        this.dryGain = this.ctx.createGain();
        this.wetGain = this.ctx.createGain();
        this.convolver = this.ctx.createConvolver();

        this.dryGain.connect(this.compressor);
        this.wetGain.connect(this.convolver);
        this.convolver.connect(this.compressor);
        this.compressor.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);

        this.noiseBuffer = this._createNoiseBuffer(2.5);
        this.setReverbMode(this.reverbMode);
      }

      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return this.ctx;
    }

    setMasterVolume(val) {
      this.masterVolume = Math.max(0, Math.min(1.2, Number(val)));
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setTargetAtTime(this.masterVolume, this.ctx.currentTime, 0.015);
      }
    }

    setReverbMode(mode) {
      this.reverbMode = mode;
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      if (mode === 'dry') {
        this.dryGain.gain.setTargetAtTime(1.0, now, 0.02);
        this.wetGain.gain.setTargetAtTime(0.0, now, 0.02);
      } else if (mode === 'room') {
        this.convolver.buffer = this._createImpulseResponse(0.85, 3.2);
        this.dryGain.gain.setTargetAtTime(0.92, now, 0.02);
        this.wetGain.gain.setTargetAtTime(0.22, now, 0.02);
      } else {
        // stage - 戏台空间感
        this.convolver.buffer = this._createImpulseResponse(1.85, 2.3);
        this.dryGain.gain.setTargetAtTime(0.85, now, 0.02);
        this.wetGain.gain.setTargetAtTime(0.38, now, 0.02);
      }
    }

    _createNoiseBuffer(durationSec) {
      const length = Math.floor(this.ctx.sampleRate * durationSec);
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      return buffer;
    }

    _createImpulseResponse(durationSec, decay) {
      const rate = this.ctx.sampleRate;
      const length = Math.floor(rate * durationSec);
      const buffer = this.ctx.createBuffer(2, length, rate);
      for (let ch = 0; ch < 2; ch++) {
        const data = buffer.getChannelData(ch);
        for (let i = 0; i < length; i++) {
          const t = i / length;
          const env = Math.pow(1 - t, decay);
          // 轻微早期反射染色
          data[i] = (Math.random() * 2 - 1) * env * 0.6;
        }
      }
      return buffer;
    }

    _routeVoice(voiceGain, tailGroup, stopTime) {
      voiceGain.connect(this.dryGain);
      voiceGain.connect(this.wetGain);

      const entry = { gain: voiceGain, tailGroup: tailGroup || 'none', stopTime: stopTime };
      this.activeVoices.push(entry);

      // 清理已过期引用
      const now = this.ctx.currentTime;
      if (this.activeVoices.length > 64) {
        this.activeVoices = this.activeVoices.filter(function (v) {
          return v.stopTime > now;
        });
      }
      return entry;
    }

    /**
     * 止音（静音金属长尾，或全部静音）
     * @param {string} targetGroup 'metal' | 'all'
     */
    choke(targetGroup) {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const group = targetGroup || 'all';
      this.activeVoices.forEach(function (v) {
        if (v.stopTime <= now) return;
        if (group === 'all' || v.tailGroup === group) {
          try {
            v.gain.gain.cancelScheduledValues(now);
            v.gain.gain.setValueAtTime(Math.max(0.0001, v.gain.gain.value), now);
            v.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
            v.stopTime = now + 0.05;
          } catch (_) {
            // ignore
          }
        }
      });
    }

    /**
     * 触发单个乐器
     * @param {string} instrumentId
     * @param {{ volume?: number, pitch?: number, delayMs?: number }} opts
     */
    triggerInstrument(instrumentId, opts) {
      const ctx = this.ensureContext();
      const options = opts || {};
      const volume = options.volume !== undefined ? options.volume : 1.0;
      const pitchSemitones = options.pitch !== undefined ? options.pitch : 0;
      const delaySec = Math.max(0, (options.delayMs || 0) / 1000);
      const pitchMult = Math.pow(2, pitchSemitones / 12);
      const t = ctx.currentTime + delaySec;

      // 微小自然人文抖动（防止高速连击相位完全重叠产生机械感）
      const humanPitch = pitchMult * (1 + (Math.random() - 0.5) * 0.006);
      const gain = Math.max(0.01, Math.min(1.6, volume));

      switch (instrumentId) {
        case 'daluo':
          this._playDaLuo(t, gain, humanPitch, false);
          break;
        case 'daluo_soft':
          this._playDaLuo(t, gain * 0.85, humanPitch * 1.03, true);
          break;
        case 'xiaoluo':
          this._playXiaoLuo(t, gain, humanPitch);
          break;
        case 'fengluo':
          this._playFengLuo(t, gain, humanPitch);
          break;
        case 'dangzi':
          this._playDangZi(t, gain, humanPitch);
          break;
        case 'naobo':
          this._playNaoBo(t, gain, humanPitch, 0.72, 1.0);
          break;
        case 'naobo_choke':
          this._playNaoBo(t, gain * 0.9, humanPitch * 1.08, 0.095, 0.75);
          break;
        case 'xiaobo':
          this._playNaoBo(t, gain * 0.88, humanPitch * 1.48, 0.42, 0.95);
          break;
        case 'guangbo':
          this._playNaoBo(t, gain * 1.05, humanPitch * 0.76, 1.05, 1.1);
          break;
        case 'bangu':
          this._playBanGu(t, gain, humanPitch);
          break;
        case 'bangu_rim':
          this._playBanGuRim(t, gain, humanPitch);
          break;
        case 'datanggu':
          this._playTangGu(t, gain, humanPitch, 148, 66, 0.55);
          break;
        case 'xiaotanggu':
          this._playTangGu(t, gain * 0.92, humanPitch, 255, 142, 0.28);
          break;
        case 'ban':
          this._playBan(t, gain, humanPitch);
          break;
        case 'bangzi':
          this._playBangZi(t, gain, humanPitch);
          break;
        case 'muyu':
          this._playMuYu(t, gain, humanPitch);
          break;
        case 'pengling':
          this._playBell(t, gain * 0.75, humanPitch, [3360, 5070, 6810, 9120], 1.55);
          break;
        case 'yinqing':
          this._playBell(t, gain * 0.8, humanPitch, [2180, 4490, 6610, 8950], 1.9);
          break;
        default:
          this._playDaLuo(t, gain, humanPitch, false);
      }
    }

    /**
     * 触发一个打击垫配置（支持最多3种乐器组合 + 止音）
     */
    triggerPad(padConfig) {
      this.ensureContext();
      if (padConfig.chokeOnHit) {
        this.choke('metal');
      }
      const layers = Array.isArray(padConfig.layers) ? padConfig.layers : [];
      for (let i = 0; i < layers.length; i++) {
        const layer = layers[i];
        if (!layer || !layer.instrument) continue;
        this.triggerInstrument(layer.instrument, {
          volume: layer.volume !== undefined ? layer.volume : 1.0,
          pitch: layer.pitch !== undefined ? layer.pitch : 0,
          delayMs: layer.delayMs !== undefined ? layer.delayMs : 0
        });
      }
    }

    // ======================== 具体乐器物理建模合成 ========================

    /**
     * 大锣（核心特征：京剧大锣特有的起音明亮、随后主基频明显下行滑音「仓—昂」）
     */
    _playDaLuo(t, gain, p, isMuted) {
      const ctx = this.ctx;
      const dur = isMuted ? 0.42 : 2.15;
      const voiceGain = ctx.createGain();
      voiceGain.gain.setValueAtTime(gain * 0.82, t);
      this._routeVoice(voiceGain, 'metal', t + dur + 0.05);

      // 1. 主体下行滑音基频与铜腔共鸣泛音
      const partials = [
        { f0: 215 * p, f1: 146 * p, amp: 0.62, decay: dur * 0.95, type: 'sine', bendTime: 0.34 },
        { f0: 223 * p, f1: 151 * p, amp: 0.36, decay: dur * 0.85, type: 'triangle', bendTime: 0.38 },
        { f0: 368 * p, f1: 274 * p, amp: 0.32, decay: dur * 0.65, type: 'sine', bendTime: 0.28 },
        { f0: 542 * p, f1: 425 * p, amp: 0.22, decay: dur * 0.48, type: 'sine', bendTime: 0.22 },
        { f0: 815 * p, f1: 690 * p, amp: 0.14, decay: dur * 0.32, type: 'triangle', bendTime: 0.18 },
        { f0: 1290 * p, f1: 1120 * p, amp: 0.09, decay: dur * 0.22, type: 'sine', bendTime: 0.14 }
      ];

      partials.forEach(function (part) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = part.type;
        osc.frequency.setValueAtTime(part.f0, t);
        osc.frequency.exponentialRampToValueAtTime(part.f1, t + part.bendTime);
        osc.frequency.exponentialRampToValueAtTime(part.f1 * 0.96, t + part.decay);

        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(part.amp, t + 0.004);
        g.gain.exponentialRampToValueAtTime(part.amp * 0.45, t + 0.16);
        g.gain.exponentialRampToValueAtTime(0.0001, t + part.decay);

        osc.connect(g);
        g.connect(voiceGain);
        osc.start(t);
        osc.stop(t + part.decay + 0.03);
      });

      // 2. 金属击打泛音噪声（槌头击铜瞬间 + 铜面沙沙声）
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1650 * p, t);
      bp.frequency.exponentialRampToValueAtTime(720 * p, t + (isMuted ? 0.15 : 0.75));
      bp.Q.setValueAtTime(1.4, t);

      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.linearRampToValueAtTime(isMuted ? 0.28 : 0.44, t + 0.003);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + (isMuted ? 0.22 : 0.92));

      noise.connect(bp);
      bp.connect(ng);
      ng.connect(voiceGain);
      noise.start(t);
      noise.stop(t + (isMuted ? 0.25 : 0.98));
    }

    /**
     * 小锣（核心特征：京剧小锣标志性的「上行滑音」“台—哎！”）
     */
    _playXiaoLuo(t, gain, p) {
      const ctx = this.ctx;
      const dur = 0.88;
      const voiceGain = ctx.createGain();
      voiceGain.gain.setValueAtTime(gain * 0.76, t);
      this._routeVoice(voiceGain, 'metal', t + dur + 0.05);

      const partials = [
        { f0: 365 * p, f1: 472 * p, amp: 0.58, decay: dur * 0.92, type: 'sine', bendTime: 0.17 },
        { f0: 374 * p, f1: 481 * p, amp: 0.28, decay: dur * 0.82, type: 'triangle', bendTime: 0.19 },
        { f0: 765 * p, f1: 935 * p, amp: 0.25, decay: dur * 0.56, type: 'sine', bendTime: 0.15 },
        { f0: 1210 * p, f1: 1410 * p, amp: 0.14, decay: dur * 0.34, type: 'sine', bendTime: 0.12 },
        { f0: 2150 * p, f1: 2380 * p, amp: 0.08, decay: dur * 0.18, type: 'triangle', bendTime: 0.09 }
      ];

      partials.forEach(function (part) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = part.type;
        osc.frequency.setValueAtTime(part.f0, t);
        osc.frequency.exponentialRampToValueAtTime(part.f1, t + part.bendTime);
        osc.frequency.exponentialRampToValueAtTime(part.f1 * 1.02, t + part.decay);

        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(part.amp, t + 0.0025);
        g.gain.exponentialRampToValueAtTime(part.amp * 0.52, t + 0.12);
        g.gain.exponentialRampToValueAtTime(0.0001, t + part.decay);

        osc.connect(g);
        g.connect(voiceGain);
        osc.start(t);
        osc.stop(t + part.decay + 0.03);
      });

      // 木片击小锣清脆瞬态
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const hp = ctx.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.setValueAtTime(2800 * p, t);
      hp.Q.setValueAtTime(2.2, t);

      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.26, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);

      noise.connect(hp);
      hp.connect(ng);
      ng.connect(voiceGain);
      noise.start(t);
      noise.stop(t + 0.12);
    }

    /**
     * 风锣（低沉绵长、泛音起伏涌动）
     */
    _playFengLuo(t, gain, p) {
      const ctx = this.ctx;
      const dur = 2.8;
      const voiceGain = ctx.createGain();
      voiceGain.gain.setValueAtTime(gain * 0.78, t);
      this._routeVoice(voiceGain, 'metal', t + dur + 0.08);

      const ratios = [1, 1.37, 1.81, 2.43, 3.19, 4.12];
      const base = 132 * p;
      ratios.forEach(function (r, idx) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(base * r, t);
        osc.frequency.exponentialRampToValueAtTime(base * r * 0.94, t + dur);

        const peak = 0.42 / (idx * 0.65 + 1);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(peak * 0.65, t + 0.02);
        // 风锣标志性的“涌起”泛音包络
        g.gain.linearRampToValueAtTime(peak, t + 0.28 + idx * 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur * (1 - idx * 0.09));

        osc.connect(g);
        g.connect(voiceGain);
        osc.start(t);
        osc.stop(t + dur + 0.05);
      });

      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(980 * p, t);
      bp.Q.setValueAtTime(0.9, t);

      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.linearRampToValueAtTime(0.26, t + 0.08);
      ng.gain.linearRampToValueAtTime(0.32, t + 0.35);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.88);

      noise.connect(bp);
      bp.connect(ng);
      ng.connect(voiceGain);
      noise.start(t);
      noise.stop(t + dur * 0.92);
    }

    /**
     * 铛子（清亮小铜盘，高音金属鸣响）
     */
    _playDangZi(t, gain, p) {
      const ctx = this.ctx;
      const dur = 0.72;
      const voiceGain = ctx.createGain();
      voiceGain.gain.setValueAtTime(gain * 0.68, t);
      this._routeVoice(voiceGain, 'metal', t + dur + 0.04);

      const freqs = [920 * p, 1485 * p, 2360 * p, 3490 * p];
      freqs.forEach(function (f, i) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = i === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(f, t);
        const amp = 0.45 / (i + 1);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(amp, t + 0.002);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur / (1 + i * 0.35));
        osc.connect(g);
        g.connect(voiceGain);
        osc.start(t);
        osc.stop(t + dur + 0.02);
      });
    }

    /**
     * 铙钹 / 小钹 / 广钹 / 闷钹（不谐和金属方波簇 + 宽带高通金属嘶响）
     */
    _playNaoBo(t, gain, p, dur, bodyWeight) {
      const ctx = this.ctx;
      const voiceGain = ctx.createGain();
      voiceGain.gain.setValueAtTime(gain * 0.72, t);
      this._routeVoice(voiceGain, dur > 0.2 ? 'metal' : 'none', t + dur + 0.05);

      // 1. 不谐和金属振子群（模拟双钹对击的密集金属泛音）
      const metalFreqs = [615, 892, 1185, 1630, 2210, 3140];
      const metalBus = ctx.createGain();
      const metalHP = ctx.createBiquadFilter();
      metalHP.type = 'highpass';
      metalHP.frequency.setValueAtTime(1400 * p, t);

      metalBus.gain.setValueAtTime(0.0001, t);
      metalBus.gain.linearRampToValueAtTime(0.32 * bodyWeight, t + 0.002);
      metalBus.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.85);

      metalBus.connect(metalHP);
      metalHP.connect(voiceGain);

      metalFreqs.forEach(function (f) {
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(f * p, t);
        osc.connect(metalBus);
        osc.start(t);
        osc.stop(t + dur + 0.02);
      });

      // 2. 高频金属噪波（铙钹标志性的“才—擦”质感）
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(2200 * p, t);

      const peak = ctx.createBiquadFilter();
      peak.type = 'peaking';
      peak.frequency.setValueAtTime(4600 * p, t);
      peak.Q.setValueAtTime(1.5, t);
      peak.gain.setValueAtTime(7, t);

      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.linearRampToValueAtTime(0.68, t + 0.002);
      ng.gain.exponentialRampToValueAtTime(0.24, t + Math.min(0.08, dur * 0.4));
      ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      noise.connect(hp);
      hp.connect(peak);
      peak.connect(ng);
      ng.connect(voiceGain);
      noise.start(t);
      noise.stop(t + dur + 0.03);
    }

    /**
     * 板鼓 / 单皮鼓（高亢紧实、穿透力极强的“单/笃”）
     */
    _playBanGu(t, gain, p) {
      const ctx = this.ctx;
      const dur = 0.13;
      const voiceGain = ctx.createGain();
      voiceGain.gain.setValueAtTime(gain * 0.95, t);
      this._routeVoice(voiceGain, 'none', t + dur + 0.02);

      // 鼓心紧绷皮面共振
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1320 * p, t);
      osc.frequency.exponentialRampToValueAtTime(640 * p, t + 0.018);
      osc.frequency.exponentialRampToValueAtTime(520 * p, t + 0.09);

      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.85, t + 0.0012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.085);

      osc.connect(g);
      g.connect(voiceGain);
      osc.start(t);
      osc.stop(t + 0.11);

      // 竹楗敲击高频脆点
      const clickOsc = ctx.createOscillator();
      const cg = ctx.createGain();
      clickOsc.type = 'sine';
      clickOsc.frequency.setValueAtTime(2450 * p, t);
      clickOsc.frequency.exponentialRampToValueAtTime(1480 * p, t + 0.015);
      cg.gain.setValueAtTime(0.55, t);
      cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.024);
      clickOsc.connect(cg);
      cg.connect(voiceGain);
      clickOsc.start(t);
      clickOsc.stop(t + 0.03);

      // 短促木皮瞬态噪波
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(2600 * p, t);
      bp.Q.setValueAtTime(2.6, t);

      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.58, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.028);

      noise.connect(bp);
      bp.connect(ng);
      ng.connect(voiceGain);
      noise.start(t);
      noise.stop(t + 0.04);
    }

    /**
     * 鼓边 / 撕边（敲击板鼓木沿的高脆音）
     */
    _playBanGuRim(t, gain, p) {
      const ctx = this.ctx;
      const dur = 0.08;
      const voiceGain = ctx.createGain();
      voiceGain.gain.setValueAtTime(gain * 0.85, t);
      this._routeVoice(voiceGain, 'none', t + dur + 0.02);

      const freqs = [1880 * p, 3260 * p];
      freqs.forEach(function (f, i) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, t);
        osc.frequency.exponentialRampToValueAtTime(f * 0.88, t + 0.035);
        g.gain.setValueAtTime(i === 0 ? 0.55 : 0.35, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
        osc.connect(g);
        g.connect(voiceGain);
        osc.start(t);
        osc.stop(t + 0.06);
      });

      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const hp = ctx.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.setValueAtTime(3900 * p, t);
      hp.Q.setValueAtTime(3.0, t);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.65, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
      noise.connect(hp);
      hp.connect(ng);
      ng.connect(voiceGain);
      noise.start(t);
      noise.stop(t + 0.03);
    }

    /**
     * 大堂鼓 / 小堂鼓（浑厚鼓腔共振 + 鼓槌击皮瞬态）
     */
    _playTangGu(t, gain, p, fStart, fEnd, dur) {
      const ctx = this.ctx;
      const voiceGain = ctx.createGain();
      voiceGain.gain.setValueAtTime(gain * 1.05, t);
      this._routeVoice(voiceGain, 'drum', t + dur + 0.05);

      // 主鼓膜基频
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(fStart * p, t);
      osc.frequency.exponentialRampToValueAtTime(fEnd * p, t + 0.075);
      osc.frequency.exponentialRampToValueAtTime(fEnd * 0.88 * p, t + dur);

      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.95, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      osc.connect(g);
      g.connect(voiceGain);
      osc.start(t);
      osc.stop(t + dur + 0.03);

      // 鼓腔二次泛音增加厚实感
      const bodyOsc = ctx.createOscillator();
      const bg = ctx.createGain();
      bodyOsc.type = 'triangle';
      bodyOsc.frequency.setValueAtTime(fStart * 1.56 * p, t);
      bodyOsc.frequency.exponentialRampToValueAtTime(fEnd * 1.52 * p, t + 0.14);
      bg.gain.setValueAtTime(0.32, t);
      bg.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.45);
      bodyOsc.connect(bg);
      bg.connect(voiceGain);
      bodyOsc.start(t);
      bodyOsc.stop(t + dur * 0.5);

      // 槌击鼓皮低频冲击
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(950 * p, t);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.45, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      noise.connect(lp);
      lp.connect(ng);
      ng.connect(voiceGain);
      noise.start(t);
      noise.stop(t + 0.08);
    }

    /**
     * 檀板（红木硬板对拍：双微瞬态硬木爆裂声）
     */
    _playBan(t, gain, p) {
      const ctx = this.ctx;
      const voiceGain = ctx.createGain();
      voiceGain.gain.setValueAtTime(gain * 0.92, t);
      this._routeVoice(voiceGain, 'none', t + 0.12);

      // 檀板两片碰击常有极轻微（~4ms）的弹性预击
      [0, 0.004].forEach(function (offset, idx) {
        const st = t + offset;
        const amp = idx === 0 ? 0.45 : 0.9;

        const noise = ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(2150 * p, st);
        bp.Q.setValueAtTime(4.2, st);

        const ng = ctx.createGain();
        ng.gain.setValueAtTime(amp, st);
        ng.gain.exponentialRampToValueAtTime(0.0001, st + 0.032);

        noise.connect(bp);
        bp.connect(ng);
        ng.connect(voiceGain);
        noise.start(st);
        noise.stop(st + 0.04);

        const osc = ctx.createOscillator();
        const og = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1420 * p, st);
        osc.frequency.exponentialRampToValueAtTime(980 * p, st + 0.022);
        og.gain.setValueAtTime(amp * 0.55, st);
        og.gain.exponentialRampToValueAtTime(0.0001, st + 0.03);
        osc.connect(og);
        og.connect(voiceGain);
        osc.start(st);
        osc.stop(st + 0.035);
      }, this);
    }

    /**
     * 梆子（硬木空腔清脆高音）
     */
    _playBangZi(t, gain, p) {
      const ctx = this.ctx;
      const dur = 0.14;
      const voiceGain = ctx.createGain();
      voiceGain.gain.setValueAtTime(gain * 0.88, t);
      this._routeVoice(voiceGain, 'none', t + dur + 0.02);

      const partials = [
        { f: 1120 * p, amp: 0.72, dec: 0.085 },
        { f: 2480 * p, amp: 0.34, dec: 0.045 },
        { f: 3820 * p, amp: 0.14, dec: 0.022 }
      ];
      partials.forEach(function (part) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(part.f, t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(part.amp, t + 0.0015);
        g.gain.exponentialRampToValueAtTime(0.0001, t + part.dec);
        osc.connect(g);
        g.connect(voiceGain);
        osc.start(t);
        osc.stop(t + part.dec + 0.02);
      });
    }

    /**
     * 木鱼（圆润中音木腔）
     */
    _playMuYu(t, gain, p) {
      const ctx = this.ctx;
      const dur = 0.18;
      const voiceGain = ctx.createGain();
      voiceGain.gain.setValueAtTime(gain * 0.9, t);
      this._routeVoice(voiceGain, 'none', t + dur + 0.02);

      const partials = [
        { f: 735 * p, amp: 0.8, dec: 0.12 },
        { f: 1520 * p, amp: 0.25, dec: 0.055 }
      ];
      partials.forEach(function (part) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(part.f * 1.03, t);
        osc.frequency.exponentialRampToValueAtTime(part.f, t + 0.015);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(part.amp, t + 0.002);
        g.gain.exponentialRampToValueAtTime(0.0001, t + part.dec);
        osc.connect(g);
        g.connect(voiceGain);
        osc.start(t);
        osc.stop(t + part.dec + 0.02);
      });
    }

    /**
     * 碰铃 / 引磬（清澈高音铜铃泛音）
     */
    _playBell(t, gain, p, freqs, dur) {
      const ctx = this.ctx;
      const voiceGain = ctx.createGain();
      voiceGain.gain.setValueAtTime(gain * 0.65, t);
      this._routeVoice(voiceGain, 'metal', t + dur + 0.05);

      freqs.forEach(function (f, i) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f * p, t);
        const amp = 0.42 / (i * 0.75 + 1);
        const dec = dur / (1 + i * 0.35);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(amp, t + 0.0015);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
        osc.connect(g);
        g.connect(voiceGain);
        osc.start(t);
        osc.stop(t + dec + 0.03);
      });
    }
  }

  global.OperaAudio = {
    INSTRUMENTS: INSTRUMENTS,
    INSTRUMENT_MAP: INSTRUMENT_MAP,
    engine: new OperaAudioEngine()
  };
})(window);
