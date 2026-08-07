const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let lastResult = null;

const SHAPES = {
  '直線': { end: 2, two_way: 0, three_way: 0 },
  'L': { end: 2, two_way: 1, three_way: 0 },
  'スクエア': { end: 0, two_way: 4, three_way: 0 },
  'T字': { end: 3, two_way: 0, three_way: 1 },
};

const els = {
  file: $('#fileInput'), drop: $('#dropzone'), empty: $('#emptyState'), preview: $('#previewState'), image: $('#previewImage'),
  badge: $('#aiBadge'), note: $('#analysisNote'), calculate: $('#calculateBtn'), result: $('#resultSection'), toast: $('#toast')
};

function toast(message) { els.toast.textContent = message; els.toast.classList.add('show'); setTimeout(() => els.toast.classList.remove('show'), 2600); }
function selected(name) { return document.querySelector(`input[name="${name}"]:checked`).value; }
function setSelected(name, value) { const node = document.querySelector(`input[name="${name}"][value="${value}"]`); if (node) node.checked = true; }
function payload() { return {
  total_width: +$('#totalWidth').value, ch: +$('#ch').value, product: selected('product'), shape: selected('shape'),
  end_width: +$('#endWidth').value, insertion: +$('#insertion').value, min_panel_width: +$('#minPanel').value,
  panel_height_deduction: 0, end_length_deduction: 0, door_deduction: +$('#doorDeduction').value
}; }
function ceilDiv(a, b) { return Math.ceil(a / b); }

function calculate(req) {
  if (!Number.isFinite(req.total_width) || req.total_width < 1) throw new Error('採寸総幅を入力してください');
  if (!Number.isFinite(req.ch) || req.ch < 1) throw new Error('CHを入力してください');
  if (req.insertion > req.end_width) throw new Error('入り込み寸法はEND幅以下にしてください');
  if (req.min_panel_width < 1 || req.min_panel_width > 899) throw new Error('最小パネル幅は1～899mmで設定してください');
  const shape = SHAPES[req.shape];
  const endCount = shape.end, twoWay = shape.two_way, threeWay = shape.three_way;
  const endUnitDeduction = req.end_width - req.insertion;
  const endDeduction = endCount * endUnitDeduction;
  const twoWayDeduction = req.product === 'SW' && twoWay >= 1 ? twoWay * 80 : 0;
  const threeWayDeduction = req.product === 'SW' && threeWay >= 1 ? threeWay * 80 : 0;
  const connectionDeduction = twoWayDeduction + threeWayDeduction;
  const allocationWidth = req.total_width - endDeduction - req.door_deduction - connectionDeduction;
  if (allocationWidth <= 0) throw new Error('控除後の割付対象幅が0以下です');

  const base1200 = Math.floor(allocationWidth / 1200);
  const initialRemainder = allocationWidth % 1200;
  let replacementCount = 0, adjustmentWidth = 0, adjustmentCount = 0;
  if (initialRemainder > 0) {
    replacementCount = initialRemainder >= req.min_panel_width ? 0 : ceilDiv(req.min_panel_width - initialRemainder, 300);
    replacementCount = Math.min(base1200, replacementCount);
    adjustmentWidth = initialRemainder + replacementCount * 300;
    adjustmentCount = 1;
    if (adjustmentWidth < req.min_panel_width) throw new Error('設定条件では最小パネル幅を確保できません');
  }
  const count1200 = base1200 - replacementCount;
  const count900 = replacementCount;
  const panelCount = count1200 + count900 + adjustmentCount;
  const reconstructed = count1200 * 1200 + count900 * 900 + adjustmentWidth;
  const difference = allocationWidth - reconstructed;
  const pieces = [
    ...Array.from({length: count1200}, () => ({type:'1200', width:1200})),
    ...Array.from({length: count900}, () => ({type:'900', width:900})),
    ...(adjustmentCount ? [{type:'adjustment', width:adjustmentWidth}] : [])
  ];
  return {
    product:req.product, product_name:req.product === 'PL' ? 'アルミパーティション' : 'スチールパーティション', shape:req.shape, input:req,
    counts:{end:endCount,two_way:twoWay,three_way:threeWay,panel_1200:count1200,panel_900:count900,adjustment:adjustmentCount,total_panels:panelCount},
    dimensions:{total_width:req.total_width,allocation_width:allocationWidth,end_unit_deduction:endUnitDeduction,end_deduction:endDeduction,two_way_deduction:twoWayDeduction,three_way_deduction:threeWayDeduction,connection_deduction:connectionDeduction,door_deduction:req.door_deduction,initial_remainder:initialRemainder,adjustment_width:adjustmentWidth,panel_height:req.ch,end_length:req.ch,difference},
    pieces,
    formula:{label:'総幅 − END数×（END幅−入り込み）− ドア控除 − 接続控除',expression:`${req.total_width.toLocaleString()} − ${endCount}×(${req.end_width}−${req.insertion}) − ${req.door_deduction.toLocaleString()} − ${connectionDeduction.toLocaleString()}`,result:allocationWidth},
    status:difference === 0 ? 'OK' : '要確認'
  };
}

function normalizeOcr(text) {
  return text.replace(/[，]/g, ',').replace(/[：]/g, ':').replace(/[Ｏ〇]/g, '0').replace(/[Ｉｌ]/g, '1');
}
function inferFromText(raw) {
  const text = normalizeOcr(raw);
  let shape = null;
  if (/スクエア|四角|□/.test(text)) shape = 'スクエア';
  else if (/T\s*字|Ｔ\s*字/i.test(text)) shape = 'T字';
  else if (/L\s*字|Ｌ\s*字/i.test(text)) shape = 'L';
  else if (/直線/.test(text)) shape = '直線';
  const product = /\bSW\b|ＳＷ/i.test(text) ? 'SW' : (/\bPL\b|ＰＬ/i.test(text) ? 'PL' : null);
  const chMatch = text.match(/(?:CH|ＣＨ|天井高)\s*[:：]?\s*(\d{3,5})/i);
  const ch = chMatch ? +chMatch[1] : null;
  const numbers = [...text.matchAll(/(?<!\d)(\d{3,5}(?:,\d{3})?)(?!\d)/g)].map(m => +m[1].replace(/,/g,''));
  const plausible = numbers.filter(n => n >= 300 && n <= 30000);
  const widths = plausible.filter(n => n !== ch);
  const totalWidth = widths.length ? Math.max(...widths) : null;
  let score = 0.25 + (totalWidth ? .25 : 0) + (ch ? .25 : 0) + (product ? .1 : 0) + (shape ? .1 : 0);
  return {shape, product, total_width:totalWidth, ch, confidence:Math.min(.9,score)};
}

async function analyzeFile(file) {
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) { toast('20MB以下のファイルを選択してください'); return; }
  if (!file.type.startsWith('image/')) { toast('GitHub Pages版はJPG・PNG画像に対応しています'); return; }
  els.empty.classList.add('hidden'); els.preview.classList.remove('hidden'); els.image.classList.remove('hidden');
  const objectUrl = URL.createObjectURL(file); els.image.src = objectUrl;
  els.badge.textContent = 'OCR解析中'; els.badge.classList.remove('muted');
  els.note.className = 'notice'; els.note.innerHTML = '<b>端末内で画像を解析しています</b><span>画像は外部サーバーへ送信しません。初回はOCRの読込に時間がかかります。</span>';
  try {
    if (!window.Tesseract) throw new Error('OCRライブラリを読み込めませんでした');
    const { data } = await Tesseract.recognize(file, 'jpn+eng', { logger: m => {
      if (m.status === 'recognizing text') els.badge.textContent = `OCR ${Math.round((m.progress || 0) * 100)}%`;
    }});
    const parsed = inferFromText(data.text || '');
    if (parsed.total_width) { $('#totalWidth').value = parsed.total_width; $('#widthCheck').textContent = 'OCR候補'; }
    if (parsed.ch) { $('#ch').value = parsed.ch; $('#chCheck').textContent = 'OCR候補'; }
    if (parsed.product) setSelected('product', parsed.product);
    if (parsed.shape) setSelected('shape', parsed.shape);
    const pct = Math.round(parsed.confidence * 100); els.badge.textContent = `OCR ${pct}%`;
    els.note.className = 'notice warn';
    els.note.innerHTML = '<b>読取候補を反映しました</b><span>必ず元図面と寸法・CH・製品・形状を照合してから計算してください。</span>';
    $$('.step').forEach(x => x.classList.toggle('active', x.dataset.step === '2')); toast('OCR読取候補を反映しました');
  } catch (e) {
    els.badge.textContent = 'OCRエラー'; els.note.className = 'notice warn';
    els.note.innerHTML = `<b>自動読取できませんでした</b><span>${e.message}。手入力でそのまま計算できます。</span>`;
  } finally { URL.revokeObjectURL(objectUrl); }
}

els.file.addEventListener('change', e => analyzeFile(e.target.files[0]));
['dragenter','dragover'].forEach(ev => els.drop.addEventListener(ev, e => { e.preventDefault(); els.drop.classList.add('drag'); }));
['dragleave','drop'].forEach(ev => els.drop.addEventListener(ev, e => { e.preventDefault(); els.drop.classList.remove('drag'); }));
els.drop.addEventListener('drop', e => analyzeFile(e.dataTransfer.files[0]));
$('#resetBtn').addEventListener('click', () => {
  els.file.value = ''; els.empty.classList.remove('hidden'); els.preview.classList.add('hidden'); els.result.classList.add('hidden');
  els.badge.textContent = 'OCR未解析'; els.badge.classList.add('muted'); els.note.className = 'notice';
  els.note.innerHTML = '<b>図面を追加してください</b><span>読取後も、必ず図面と照合してから計算してください。</span>';
});

function render(result) {
  lastResult = result; $('#allocationWidth').textContent = result.dimensions.allocation_width.toLocaleString();
  $('#productName').textContent = `${result.product} / ${result.product_name}`; $('#statusPill').textContent = result.status === 'OK' ? 'CHECKED' : 'REVIEW';
  const bar = $('#partitionBar'); bar.innerHTML = '';
  result.pieces.forEach(p => { const d = document.createElement('div'); d.className = `partition-piece p${p.type}`; d.style.flex = `${p.width} 1 0`; d.textContent = p.type === 'adjustment' ? `調整 ${p.width}` : p.width; bar.appendChild(d); });
  $('#partitionLegend').innerHTML = '<span><i style="background:#cce7ef"></i>W1200</span><span><i style="background:#bde6dc"></i>W900</span><span><i style="background:#ffe2a9"></i>調整</span>';
  const items = [['W1200',result.counts.panel_1200,'枚'],['W900',result.counts.panel_900,'枚'],['調整',result.counts.adjustment,result.dimensions.adjustment_width?`${result.dimensions.adjustment_width}mm`:'不要'],['END',result.counts.end,'本'],['2WAY',result.counts.two_way,'個'],['3WAY',result.counts.three_way,'個']];
  $('#partsGrid').innerHTML = items.map(x => `<div class="part"><span>${x[0]}</span><strong>${x[1]}</strong><small>${x[2]}</small></div>`).join('');
  $('#formulaLabel').textContent = result.formula.label; $('#formulaExpression').textContent = `${result.formula.expression} ＝ ${result.formula.result.toLocaleString()}mm`;
  $('#deductionGrid').innerHTML = [['END控除',result.dimensions.end_deduction],['接続控除',result.dimensions.connection_deduction],['ドア控除',result.dimensions.door_deduction]].map(x => `<div><span>${x[0]}</span><b>${x[1].toLocaleString()}mm</b></div>`).join('');
  els.result.classList.remove('hidden'); $$('.step').forEach(x => x.classList.toggle('active', x.dataset.step === '3')); els.result.scrollIntoView({behavior:'smooth',block:'start'});
}

els.calculate.addEventListener('click', () => {
  els.calculate.disabled = true; els.calculate.querySelector('span').textContent = '計算中…';
  try { render(calculate(payload())); } catch (e) { toast(e.message || '入力内容を確認してください'); }
  finally { els.calculate.disabled = false; els.calculate.querySelector('span').textContent = '拾い出しを実行'; }
});

async function exportExcel() {
  if (!lastResult) lastResult = calculate(payload());
  if (!window.ExcelJS) throw new Error('Excel出力機能を読み込めませんでした');
  const r = lastResult, wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('拾い出し結果', {views:[{showGridLines:false}]});
  ws.columns = [{width:3},{width:24},{width:22},{width:22},{width:24},{width:3}];
  ws.mergeCells('B2:E3'); const title = ws.getCell('B2'); title.value = 'パーテーション 拾い出し結果'; title.font = {name:'Arial',size:20,bold:true,color:{argb:'FFFFFFFF'}}; title.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF163A5F'}}; title.alignment={horizontal:'center',vertical:'middle'};
  const rows = [['製品',`${r.product}（${r.product_name}）`],['形状',r.shape],['総幅',r.dimensions.total_width],['割付対象幅',r.dimensions.allocation_width],['CH',r.input.ch],['END',r.counts.end],['2WAY',r.counts.two_way],['3WAY',r.counts.three_way],['W1200',r.counts.panel_1200],['W900',r.counts.panel_900],['調整パネル',r.counts.adjustment],['調整幅',r.dimensions.adjustment_width]];
  rows.forEach((row,i)=>{ const rr=5+i; ws.getCell(`B${rr}`).value=row[0]; ws.getCell(`C${rr}`).value=row[1]; ['B','C'].forEach(c=>{ws.getCell(`${c}${rr}`).border={top:{style:'thin',color:{argb:'FFB7C9D6'}},left:{style:'thin',color:{argb:'FFB7C9D6'}},bottom:{style:'thin',color:{argb:'FFB7C9D6'}},right:{style:'thin',color:{argb:'FFB7C9D6'}}};}); ws.getCell(`B${rr}`).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFD9EAF7'}}; ws.getCell(`B${rr}`).font={bold:true}; ws.getCell(`C${rr}`).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE2F0D9'}}; ws.getCell(`C${rr}`).font={bold:true}; });
  ws.mergeCells('B19:E19'); ws.getCell('B19').value='計算根拠'; ws.getCell('B19').fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1F4E78'}}; ws.getCell('B19').font={bold:true,color:{argb:'FFFFFFFF'}}; ws.getCell('B19').alignment={horizontal:'center'};
  ws.mergeCells('B20:E22'); ws.getCell('B20').value=`${r.formula.label}\n${r.formula.expression} ＝ ${r.formula.result.toLocaleString()}mm`; ws.getCell('B20').alignment={wrapText:true,vertical:'middle',horizontal:'center'}; ws.getCell('B20').fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFF2CC'}};
  const buffer = await wb.xlsx.writeBuffer(); const blob = new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='パーテーション拾い出し結果.xlsx'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); toast('Excelを出力しました');
}
$('#exportBtn').addEventListener('click', async () => { try { await exportExcel(); } catch(e) { toast(e.message); } });
$('#copyBtn').addEventListener('click', async () => { if (!lastResult) return; const r=lastResult; const text=`${r.product} ${r.shape} / 割付対象幅 ${r.dimensions.allocation_width}mm / W1200×${r.counts.panel_1200}、W900×${r.counts.panel_900}、調整${r.dimensions.adjustment_width}mm×${r.counts.adjustment}、END×${r.counts.end}、2WAY×${r.counts.two_way}、3WAY×${r.counts.three_way}`; await navigator.clipboard.writeText(text); toast('結果をコピーしました'); });

window.WALLFIT = { calculate, SHAPES };
