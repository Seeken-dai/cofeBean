(function (root, factory) {
  const api = factory();
  root.PhotoTone = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SAMPLE_SIZE = 64;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function lerp(left, right, amount) {
    return left + (right - left) * amount;
  }

  function percentile(histogram, total, ratio) {
    const target = Math.max(0, Math.min(total - 1, Math.floor(total * ratio)));
    let seen = 0;
    for (let index = 0; index < histogram.length; index += 1) {
      seen += histogram[index];
      if (seen > target) return index;
    }
    return histogram.length - 1;
  }

  function collectStats(ctx, width, height) {
    const sampleWidth = Math.max(1, Math.min(SAMPLE_SIZE, width));
    const sampleHeight = Math.max(1, Math.min(SAMPLE_SIZE, height));
    const canvas = document.createElement('canvas');
    canvas.width = sampleWidth;
    canvas.height = sampleHeight;
    const sample = canvas.getContext('2d', { willReadFrequently: true });
    sample.drawImage(ctx.canvas, 0, 0, width, height, 0, 0, sampleWidth, sampleHeight);
    const pixels = sample.getImageData(0, 0, sampleWidth, sampleHeight).data;
    const histogram = new Array(256).fill(0);
    let red = 0;
    let green = 0;
    let blue = 0;
    let count = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3] / 255;
      if (alpha <= 0) continue;
      const r = pixels[index] * alpha;
      const g = pixels[index + 1] * alpha;
      const b = pixels[index + 2] * alpha;
      red += r;
      green += g;
      blue += b;
      histogram[Math.round(clamp(0.2126 * r + 0.7152 * g + 0.0722 * b, 0, 255))] += 1;
      count += 1;
    }
    return count ? { red: red / count, green: green / count, blue: blue / count, histogram, count } : null;
  }

  function channelGain(channel, average) {
    if (!(channel > 0) || !(average > 0)) return 1;
    let gain = 1 + (average / channel - 1) * 0.55;
    if (Math.abs(channel - average) / average > 0.35) gain = 1 + (gain - 1) * 0.5;
    return clamp(gain, 0.86, 1.16);
  }

  function buildLut(gain, low, high) {
    const lut = new Uint8ClampedArray(256);
    const range = Math.max(1, high - low);
    const useContrast = range < 200;
    for (let index = 0; index < lut.length; index += 1) {
      let value = clamp(index * gain, 0, 255);
      if (useContrast) {
        const stretched = clamp((value - low) * (243 - 12) / range + 12, 0, 255);
        value = lerp(value, stretched, 0.5);
      }
      lut[index] = Math.round(value);
    }
    return lut;
  }

  function normalizeCanvas(ctx, width, height) {
    try {
      if (!ctx || !(width > 0) || !(height > 0) || typeof document === 'undefined') return false;
      const stats = collectStats(ctx, width, height);
      if (!stats) return false;
      const average = (stats.red + stats.green + stats.blue) / 3;
      const low = percentile(stats.histogram, stats.count, 0.02);
      const high = percentile(stats.histogram, stats.count, 0.98);
      const redLut = buildLut(channelGain(stats.red, average), low, high);
      const greenLut = buildLut(channelGain(stats.green, average), low, high);
      const blueLut = buildLut(channelGain(stats.blue, average), low, high);
      const image = ctx.getImageData(0, 0, width, height);
      const data = image.data;
      for (let index = 0; index < data.length; index += 4) {
        const red = redLut[data[index]];
        const green = greenLut[data[index + 1]];
        const blue = blueLut[data[index + 2]];
        const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
        data[index] = Math.round(lerp(luma, red, 0.92));
        data[index + 1] = Math.round(lerp(luma, green, 0.92));
        data[index + 2] = Math.round(lerp(luma, blue, 0.92));
      }
      ctx.putImageData(image, 0, 0);
      return true;
    } catch (_) {
      return false;
    }
  }

  async function normalizeBlob(blob) {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0);
      if (bitmap.close) bitmap.close();
      normalizeCanvas(ctx, canvas.width, canvas.height);
      return await new Promise((resolve) => canvas.toBlob((next) => resolve(next || blob), blob.type || 'image/webp', 0.88));
    } catch (_) {
      return blob;
    }
  }

  return { normalizeCanvas, normalizeBlob };
});
