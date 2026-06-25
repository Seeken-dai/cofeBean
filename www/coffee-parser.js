(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CoffeeParser = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PROCESS_TERMS = [
    ['厌氧水洗', /厌氧\s*水洗|anaerobic\s*washed/i], ['厌氧日晒', /厌氧\s*日晒|anaerobic\s*natural/i],
    ['蜜处理', /蜜处理|honey\s*process|\bhoney\b/i], ['水洗', /水洗|washed|wet\s*process/i],
    ['日晒', /日晒|natural|dry\s*process/i], ['厌氧', /厌氧|anaerobic/i], ['湿刨', /湿刨|wet\s*hull/i]
  ];
  const ROAST_TERMS = [
    ['中浅烘', /中浅(?:度)?烘焙?|medium\s*light/i], ['浅烘', /浅(?:度)?烘焙?|light\s*roast|lightly\s*roasted/i],
    ['中深烘', /中深(?:度)?烘焙?|city\s*roast|medium\s*dark/i],
    ['中烘', /中(?:度)?烘焙?|medium\s*roast/i], ['深烘', /深(?:度)?烘焙?|dark\s*roast|darkly\s*roasted/i]
  ];
  const ORIGINS = [
    ['埃塞俄比亚', /埃塞俄比亚|ethiopia|yirgacheffe|耶加雪菲|guji|古吉/i],
    ['哥伦比亚', /哥伦比亚|colombia|huila|慧兰|cauca|考卡/i],
    ['肯尼亚', /肯尼亚|kenya|nyeri|涅里/i], ['巴拿马', /巴拿马|panama|boquete|波奎特/i],
    ['哥斯达黎加', /哥斯达黎加|costa\s*rica/i], ['危地马拉', /危地马拉|guatemala/i],
    ['巴西', /巴西|brazil/i], ['印度尼西亚', /印度尼西亚|印尼|indonesia|sumatra|苏门答腊/i],
    ['卢旺达', /卢旺达|rwanda/i], ['布隆迪', /布隆迪|burundi/i], ['秘鲁', /秘鲁|peru/i],
    ['萨尔瓦多', /萨尔瓦多|el\s*salvador/i], ['洪都拉斯', /洪都拉斯|honduras/i],
    ['中国云南', /云南|yunnan/i]
  ];
  const META = /烘焙|日期|处理|海拔|产地|产区|庄园|净含量|净重|重量|风味|杯测|豆种|roast|date|process|altitude|origin|weight|notes?|flavou?r|\d{2,4}\s*(?:g|kg|克|m|米)\b/i;
  const NOTE_STOP = /烘焙(?:日期|日)?|roast(?:ed)?(?:\s*on|\s*date)?|净含量|净重|net\s*(?:weight|wt)|海拔|altitude|处理(?:法|方式)?|process|产地|origin/i;
  const FLAVOR_WORDS = /花香|茉莉|玫瑰|柑橘|柠檬|香橙|莓|草莓|蓝莓|树莓|桃|水蜜桃|芒果|菠萝|葡萄|葡萄柚|苹果|青苹果|巧克力|可可|焦糖|蜂蜜|红茶|乌龙|酒香|红酒|坚果|香草|香水凤梨|芒果软糖|芝士蛋糕|深色莓果|奶咖|黑咖|floral|jasmine|rose|flowers?|citrus|lemon|orange|berr(?:y|ies)|strawberry|blueberry|raspberry|peach|mango|pineapple|grape|grapefruit|apple|green\s*apples?|chocolate|cocoa|caramel|honey|\btea\b|wine|nutty|vanilla/gi;
  const VALUE_LABELS = /^(?:风味|flavou?r|原产地|source\s*area|处理(?:方式|法)?|process\s*mode|净含量|净重|net\s*(?:content|weight|wt)|烘焙度|roast\s*level)\b/i;

  function linesOf(scan) {
    const raw = Array.isArray(scan && scan.lines) ? scan.lines : [];
    return raw.map((line, index) => ({
      text: String(line.text || '').replace(/\s+/g, ' ').trim(), index,
      left: Number(line.left) || 0, top: Number(line.top) || 0,
      right: Number(line.right) || 0, bottom: Number(line.bottom) || 0
    })).filter((line) => line.text);
  }

  function set(result, field, value, confidence, evidence) {
    if (value == null || value === '' || result.fields[field]) return;
    result.fields[field] = value;
    result.confidence[field] = confidence;
    result.evidence[field] = evidence || '';
  }

  function findTerm(text, terms) {
    for (const [value, pattern] of terms) if (pattern.test(text)) return value;
    return '';
  }

  function cleanValue(text) {
    return String(text || '')
      .replace(/\[[^\]]+\]/g, ' ')
      .replace(/\b(?:flavou?r|source\s*area|process\s*mode|net\s*(?:content|weight|wt)|roast\s*level)\b/ig, ' ')
      .replace(/风味|原产地|处理(?:方式|法)?|净含量|净重|烘焙度|产国|产区|庄园|海拔|豆种/g, ' ')
      .replace(/[：:•|｜]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isoDate(value) {
    const numbers = String(value).match(/\d{1,4}/g);
    if (!numbers || numbers.length < 3) return '';
    let [a, b, c] = numbers.map(Number);
    let year; let month; let day;
    if (a > 1900) [year, month, day] = [a, b, c];
    else if (c > 1900) [year, month, day] = [c, a, b];
    else if (c < 100) [year, month, day] = [2000 + c, a, b];
    else return '';
    if (month < 1 || month > 12 || day < 1 || day > 31) return '';
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function extractDate(lines, result) {
    const anchor = /烘焙(?:日期|日)?|roast(?:ed)?(?:\s*on|\s*date)?/i;
    const datePattern = /(20\d{2}[./年-]\d{1,2}[./月-]\d{1,2}|\d{1,2}[./-]\d{1,2}[./-](?:20)?\d{2})/;
    for (let i = 0; i < lines.length; i += 1) {
      if (!anchor.test(lines[i].text)) continue;
      const same = lines[i].text.match(datePattern);
      const next = lines[i + 1] && lines[i + 1].text.match(datePattern);
      const matched = same || next;
      if (matched) { set(result, 'roastDate', isoDate(matched[1]), same ? .96 : .82, same ? lines[i].text : lines[i + 1].text); return; }
    }
  }

  function extractWeight(lines, result) {
    const weightPattern = /(\d{2,4}(?:\.\d+)?)\s*(kg|g|克|千克)(?:\s*\/\s*包)?(?:\b|$)/i;
    const anchors = /净含量|净重|重量|net\s*(?:content|weight|wt)|weight/i;
    let fallback = null;
    for (const line of lines) {
      const matches = Array.from(line.text.matchAll(new RegExp(weightPattern.source, 'gi')));
      if (!matches.length) continue;
      const match = anchors.test(line.text) && matches.length > 1 ? matches[matches.length - 1] : matches[0];
      let grams = Number(match[1]);
      if (/kg|千克/i.test(match[2])) grams *= 1000;
      if (!Number.isFinite(grams) || grams <= 0 || grams > 10000) continue;
      const candidate = { grams, confidence: anchors.test(line.text) ? .96 : .72, evidence: line.text };
      if (anchors.test(line.text)) { fallback = candidate; break; }
      fallback = fallback || candidate;
    }
    if (fallback) {
      set(result, 'initialWeight', fallback.grams, fallback.confidence, fallback.evidence);
      set(result, 'remainingWeight', fallback.grams, fallback.confidence, fallback.evidence);
    }
  }

  function extractNotes(lines, result) {
    const anchor = /风味(?:描述|调性)?|杯测|香气|notes?|flavou?r(?:\s*notes?)?|tasting(?:\s*notes?)?|aroma/i;
    for (let i = 0; i < lines.length; i += 1) {
      if (!anchor.test(lines[i].text)) continue;
      const after = cleanValue(lines[i].text.replace(/^.*?(?:风味(?:描述|调性)?|杯测|香气|notes?|flavou?r(?:\s*notes?)?|tasting(?:\s*notes?)?|aroma)\s*[：:]?\s*/i, ''));
      const parts = [];
      if (after && !NOTE_STOP.test(after) && !VALUE_LABELS.test(after)) parts.push(after);
      for (let offset = 1; offset <= 3 && lines[i + offset]; offset += 1) {
        const next = lines[i + offset].text;
        if (NOTE_STOP.test(next)) break;
        if (next.length >= 2 && next.length <= 100 && !/^\d+$/.test(next) && !VALUE_LABELS.test(next)) parts.push(cleanValue(next));
      }
      const value = [...new Set(parts.filter(Boolean))].join(' · ');
      if (value) { set(result, 'tastingNotes', value, after ? .92 : .82, lines[i].text); return; }
    }
    const fallback = lines.filter((line) => !NOTE_STOP.test(line.text)).filter((line) => {
      const matches = line.text.match(FLAVOR_WORDS) || [];
      return new Set(matches.map((word) => word.toLocaleLowerCase('zh-CN'))).size >= 2;
    }).slice(0, 3).map((line) => line.text);
    if (fallback.length) {
      set(result, 'tastingNotes', [...new Set(fallback)].join(' · '), .62, fallback.join(' / '));
    }
  }

  function extractProcess(lines) {
    const anchor = /处理(?:法|方式)?|process/i;
    const notes = /风味|杯测|notes?|flavou?r|tasting/i;
    for (const line of lines) {
      if (!anchor.test(line.text)) continue;
      const value = findTerm(line.text, PROCESS_TERMS);
      if (value) return value;
    }
    for (const line of lines) {
      if (notes.test(line.text)) continue;
      const value = findTerm(line.text, PROCESS_TERMS);
      if (value) return value;
    }
    return '';
  }

  function extractTableFields(lines, result) {
    for (const line of lines) {
      const text = line.text;
      if (/原产地|source\s*area/i.test(text)) {
        const value = findTerm(text, ORIGINS);
        if (value) set(result, 'origin', value, .94, text);
      }
      if (/处理(?:方式|法)?|process\s*mode/i.test(text)) {
        const value = findTerm(text, PROCESS_TERMS);
        if (value) set(result, 'process', value, .94, text);
      }
      if (/烘焙度|roast\s*level/i.test(text)) {
        const value = findTerm(text, ROAST_TERMS);
        if (value) set(result, 'roastLevel', value, .94, text);
      }
      if (/风味|flavou?r/i.test(text)) {
        const value = cleanValue(text);
        const matches = value.match(FLAVOR_WORDS) || [];
        if (matches.length) set(result, 'tastingNotes', value, .9, text);
      }
      if (/净含量|净重|net\s*(?:content|weight|wt)/i.test(text)) {
        extractWeight([line], result);
      }
    }
  }

  function extractTitles(lines, scan, context, result) {
    const knownRoasters = (context.knownRoasters || []).filter(Boolean);
    const joined = lines.map((line) => line.text).join('\n');
    const known = knownRoasters.find((name) => joined.toLocaleLowerCase('zh-CN').includes(String(name).toLocaleLowerCase('zh-CN')));
    if (known) set(result, 'roaster', known, .98, known);

    const imageHeight = Number(scan && scan.height) || Math.max(...lines.map((line) => line.bottom), 1);
    const candidates = lines.filter((line) => {
      const text = line.text;
      const ratio = line.top / imageHeight;
      const looksLikeFlavorLine = text.length > 8 && (text.match(FLAVOR_WORDS) || []).length >= 2;
      return ratio < .78 && text.length >= 2 && text.length <= 50 && !META.test(text) && !looksLikeFlavorLine && !/^[^\p{L}\p{N}\u4e00-\u9fff]+$/u.test(text) && !/^(?:roasted|coffee|ye\s*coffee|soe)$/i.test(text);
    }).map((line) => ({ ...line, size: Math.max(line.bottom - line.top, 1), centerBias: 1 - Math.min(Math.abs(((line.left + line.right) / 2) / (Number(scan.width) || line.right || 1) - .5), .5) }));
    candidates.sort((a, b) => {
      const chineseBoost = (line) => /[\u4e00-\u9fff]/.test(line.text) ? 1.24 : 1;
      return (b.size * (1 + b.centerBias * .25) * chineseBoost(b) - a.size * (1 + a.centerBias * .25) * chineseBoost(a)) || a.top - b.top;
    });
    const title = candidates.find((line) => !known || !line.text.includes(known));
    if (title) set(result, 'name', title.text, title.size > 30 ? .72 : .56, title.text);
    if (!result.fields.roaster) {
      const roaster = candidates.find((line) => line !== title && line.text !== result.fields.name);
      if (roaster) set(result, 'roaster', roaster.text, .42, roaster.text);
    }
  }

  function parse(scan, context) {
    const lines = linesOf(scan);
    const fullText = lines.map((line) => line.text).join('\n');
    const result = { fields: { status: '未开封' }, confidence: { status: 1 }, evidence: {}, rawText: fullText, lineCount: lines.length };
    extractDate(lines, result);
    extractWeight(lines, result);
    extractTableFields(lines, result);
    const process = extractProcess(lines); if (process) set(result, 'process', process, .92, process);
    const roast = findTerm(fullText, ROAST_TERMS); if (roast) set(result, 'roastLevel', roast, .9, roast);
    const origin = findTerm(fullText, ORIGINS); if (origin) set(result, 'origin', origin, .88, origin);
    extractNotes(lines, result);
    extractTitles(lines, scan || {}, context || {}, result);
    result.recognizedFields = Object.keys(result.fields).filter((field) => field !== 'status' && result.fields[field] !== '');
    result.lowConfidenceFields = result.recognizedFields.filter((field) => (result.confidence[field] || 0) < .65);
    return result;
  }

  return { parse, isoDate };
});
