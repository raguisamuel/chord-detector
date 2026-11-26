/* global Mp4Muxer, VideoEncoder, AudioEncoder, VideoFrame, MediaStreamTrackProcessor */
// Records a standard MP4 (H.264 video + AAC audio, with its index at the start of the file), the kind
// WhatsApp, the gallery and every player accept. Built from the drawn canvas and the app's audio.
(function () {
  const VIDEO = { codec: 'avc1.42001f', width: 1280, height: 720, bitrate: 4000000, framerate: 30, avc: { format: 'avc' } };

  function available() {
    return typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined'
      && typeof MediaStreamTrackProcessor !== 'undefined' && typeof VideoFrame !== 'undefined' && !!window.Mp4Muxer;
  }

  async function start(canvas, audioTrack, sampleRate) {
    if (!available()) throw new Error('not available');
    const channels = (audioTrack.getSettings && audioTrack.getSettings().channelCount) || 2;
    const audio = { codec: 'mp4a.40.2', sampleRate, numberOfChannels: channels, bitrate: 128000 };
    const [vOk, aOk] = await Promise.all([VideoEncoder.isConfigSupported(VIDEO), AudioEncoder.isConfigSupported(audio)]);
    if (!vOk.supported || !aOk.supported) throw new Error('codec not supported');

    const muxer = new Mp4Muxer.Muxer({
      target: new Mp4Muxer.ArrayBufferTarget(),
      video: { codec: 'avc', width: VIDEO.width, height: VIDEO.height },
      audio: { codec: 'aac', sampleRate, numberOfChannels: channels },
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset',
    });
    let failure = null;
    const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => { failure = e; } });
    venc.configure(VIDEO);
    const aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: (e) => { failure = e; } });
    aenc.configure(audio);

    // Video: exactly 30 frames per second (constant frame rate, the safest for WhatsApp). If the phone was
    // busy and a frame slot was missed, the current picture fills it, so the video stays in sync with the sound.
    const t0 = performance.now();
    let n = 0;
    const timer = setInterval(() => {
      if (failure || venc.state !== 'configured') return;
      const due = Math.floor(((performance.now() - t0) / 1000) * 30);
      let made = 0;
      while (n <= due && made < 4) {
        const frame = new VideoFrame(canvas, { timestamp: Math.round((n * 1000000) / 30), duration: Math.round(1000000 / 30) });
        venc.encode(frame, { keyFrame: n % 60 === 0 });
        frame.close();
        n++; made++;
      }
      if (n <= due) n = due + 1; // far behind: skip ahead rather than pile up
    }, 1000 / 60);

    // Audio: straight from the app's mix (piano, and the voice when that mode is on).
    const reader = new MediaStreamTrackProcessor({ track: audioTrack }).readable.getReader();
    let reading = true;
    const pump = (async () => {
      while (reading) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!failure && aenc.state === 'configured') aenc.encode(value);
        value.close();
      }
    })();

    return {
      async stop() {
        clearInterval(timer);
        reading = false;
        try { await reader.cancel(); } catch (e) { /* ignore */ }
        await pump.catch(() => {});
        await venc.flush().catch(() => {});
        await aenc.flush().catch(() => {});
        venc.close(); aenc.close();
        if (failure) throw failure;
        muxer.finalize();
        return new Blob([muxer.target.buffer], { type: 'video/mp4' });
      },
    };
  }

  // Can this phone make the WhatsApp-friendly MP4? (Shown on screen, so we know which format you get.)
  async function check(sampleRate) {
    if (!available()) return { mp4: false, why: 'this browser has no video encoder' };
    try {
      const [v, a] = await Promise.all([
        VideoEncoder.isConfigSupported(VIDEO),
        AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', sampleRate, numberOfChannels: 2, bitrate: 128000 }),
      ]);
      if (!v.supported) return { mp4: false, why: 'no H.264 video encoder' };
      if (!a.supported) return { mp4: false, why: 'no AAC audio encoder' };
      return { mp4: true };
    } catch (e) {
      return { mp4: false, why: String(e && e.message || e) };
    }
  }

  window.Mp4Rec = { available, start, check };
})();
