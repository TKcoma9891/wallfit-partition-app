const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let lastResult = null;

const SHAPES = {
  '直線': { end: 2, two_way: 0, three_way: 0 },
  'L': { end: 2, two_way: 1, three_way: 0 },
  'スクエア': { end: 0, two_way: 4, three_way: 0 },
  'T字': { end: 3, two_way: 0, three_way: 1 },
};
const DOOR_MASTER = {
  single: { label: '片開きドア', default_width: 900, default_height: 2100, unit: '枚', master_status: '仮マスタ・要確認' },
  parent_child: { label: '親子ドア', default_width: 1200, default_height: 2100, unit: '組', master_status: '仮マスタ・要確認' },
  double: { label: '両開きドア', default_width: 1800, default_height: 2100, unit: '組', master_status: '仮マスタ・要確認' },
  sliding: { label: '引き戸', default_width: 900, default_height: 2100, unit: '枚', master_status: '仮マスタ・要確認' },
};

const els = {
  file: $('#fileInput'), drop: $('#dropzone'), empty: $('#emptyState'), preview: $('#previewState'), image: $('#previewImage'),
  badge: $('#aiBadge'), note: $('#analysisNote'), calculate: $('#calculateBtn'), result: $('#resultSection'), toast: $('#toast')
};

function toast(message) { els.toast.textContent = message; els.toast.classList.add('show'); setTimeout(() => els.toast.classList.remove('show'), 2600); }
function selected(name) { const node = document.querySelector(`input[name="${name}"]:checked`); return node ? node.value : ''; }
function setSelected(name, value) { const node = document.querySelector(`input[name="${name}"][value="${value}"]`); if (node) node.checked = true; }
function num(id) { return +$(id).value; }
function doorInputs() {
  const makeDoor=(key,lQty,rQty,width,height)=>({
    key,label:DOOR_MASTER[key].label,l_qty:num(lQty),r_qty:num(rQty),
    qty:num(lQty)+num(rQty),width:num(width),height:num(height),unit:DOOR_MASTER[key].unit,
    master_status:DOOR_MASTER[key].master_status
  });
  return [
    makeDoor('single','#singleDoorLQty','#singleDoorRQty','#singleDoorWidth','#singleDoorHeight'),
    makeDoor('parent_child','#parentChildDoorLQty','#parentChildDoorRQty','#parentChildDoorWidth','#parentChildDoorHeight'),
    makeDoor('double','#doubleDoorLQty','#doubleDoorRQty','#doubleDoorWidth','#doubleDoorHeight'),
    makeDoor('sliding','#slidingDoorLQty','#slidingDoorRQty','#slidingDoorWidth','#slidingDoorHeight'),
  ];
}
function placementMode(){return selected('doorPlacementMode')||'span';}
function buildBasePanels(width,minWidth){
  const base1200=Math.floor(width/1200),remainder=width%1200;
  let replacement=0,adjustment=0;
  if(remainder>0){replacement=remainder>=minWidth?0:Math.min(base1200,ceilDiv(minWidth-remainder,300));adjustment=remainder+replacement*300;if(adjustment<minWidth)throw new Error('設定条件では最小パネル幅を確保できません');}
  return [...Array.from({length:base1200-replacement},()=>({type:'1200',width:1200})),...Array.from({length:replacement},()=>({type:'900',width:900})),...(adjustment?[{type:'adjustment',width:adjustment}]:[])];
}
function activeDoorInstances(doors){
  const out=[];doors.forEach(d=>[['L',d.l_qty],['R',d.r_qty]].forEach(([hand,qty])=>{for(let i=1;i<=qty;i++)out.push({id:`${d.key}-${hand}-${i}`,key:d.key,label:d.label,hand,index:i,width:d.width,height:d.height,unit:d.unit});}));return out;
}
function placementSelections(doors){
  return activeDoorInstances(doors).map(x=>({...x,span:+($(`#placement-${x.id}`)?.value||0)}));
}
function updatePlacementUI(){
  const mode=placementMode(),doors=doorInputs(),list=$('#spanPlacementList');
  $('#spanPlacementPanel').classList.toggle('hidden',mode!=='span');$('#bulkDeductionRow').classList.toggle('hidden',mode!=='bulk');
  const total=num('#totalWidth'),endWidth=num('#endWidth'),insertion=num('#insertion'),shape=SHAPES[selected('shape')]||SHAPES['直線'];
  const conn=selected('product')==='SW'?(shape.two_way+shape.three_way)*80:0;
  const baseWidth=Math.max(0,total-shape.end*(endWidth-insertion)-conn);
  let panels=[];try{panels=buildBasePanels(baseWidth,num('#minPanel'))}catch(e){}
  $('#baseSpanCount').textContent=`基準割付 ${panels.length}スパン`;
  const instances=activeDoorInstances(doors),saved={};$$('[id^="placement-"]').forEach(x=>saved[x.id]=x.value);
  if(!instances.length){list.innerHTML='<p>ドア数量を入力すると配置欄が表示されます。</p>';updateDoorSummary();return;}
  list.innerHTML=instances.map((x,n)=>{const current=saved[`placement-${x.id}`]||String(Math.min(n+1,panels.length||1));const options=panels.map((p,i)=>`<option value="${i+1}" ${String(i+1)===current?'selected':''}>${i+1}スパン目（W${p.width}）</option>`).join('');return `<div class="span-placement-item"><div><b>${x.label} ${x.hand} ${x.index}</b><small>W${x.width}×H${x.height}</small></div><label>配置<select id="placement-${x.id}">${options}</select></label><div class="sleeve-preview">袖：自動計算</div></div>`}).join('');
  updateDoorSummary();
}

function payload() {
  const doors = doorInputs();
  const mode=placementMode();
  const doorDeduct = mode==='bulk' && selected('doorDeduct') === 'はい';
  const doorOpeningTotal = doors.reduce((sum,d) => sum + d.qty * d.width, 0);
  const placements=mode==='span'?placementSelections(doors):[];
  return {
    total_width:num('#totalWidth'), ch:num('#ch'), product:selected('product'), shape:selected('shape'),
    end_width:num('#endWidth'), insertion:num('#insertion'), min_panel_width:num('#minPanel'),
    panel_height_deduction:num('#panelHeightDeduction'), end_length_deduction:0,
    door_deduction_enabled:doorDeduct, door_opening_total:doorOpeningTotal,
    door_deduction:doorDeduct ? doorOpeningTotal : 0, doors, placement_mode:mode, placements
  };
}
function ceilDiv(a, b) { return Math.ceil(a / b); }
function validateIntegerNonnegative(value, label) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label}の数量は0以上の整数で入力してください`);
}

function calculate(req) {
  if (!Number.isFinite(req.total_width) || req.total_width < 1) throw new Error('採寸総幅を入力してください');
  if (!Number.isFinite(req.ch) || req.ch < 1) throw new Error('CHを入力してください');
  if (req.insertion > req.end_width) throw new Error('入り込み寸法はEND幅以下にしてください');
  if (req.min_panel_width < 1 || req.min_panel_width > 899) throw new Error('最小パネル幅は1～899mmで設定してください');
  if (!Number.isFinite(req.panel_height_deduction) || req.panel_height_deduction < 0 || req.panel_height_deduction >= req.ch) throw new Error('パネル高さ控除を確認してください');
  req.doors.forEach(d => {
    validateIntegerNonnegative(d.l_qty, `${d.label} L`);
    validateIntegerNonnegative(d.r_qty, `${d.label} R`);
    if (d.qty > 0 && (!Number.isFinite(d.width) || d.width < 1)) throw new Error(`${d.label}の開口幅を入力してください`);
    if (d.qty > 0 && (!Number.isFinite(d.height) || d.height < 1)) throw new Error(`${d.label}の開口高を入力してください`);
  });
  const shape = SHAPES[req.shape];
  if (!shape) throw new Error('選択形状を確認してください');
  const endCount = shape.end, twoWay = shape.two_way, threeWay = shape.three_way;
  const endUnitDeduction = req.end_width - req.insertion;
  const endDeduction = endCount * endUnitDeduction;
  const twoWayDeduction = req.product === 'SW' && twoWay >= 1 ? twoWay * 80 : 0;
  const threeWayDeduction = req.product === 'SW' && threeWay >= 1 ? threeWay * 80 : 0;
  const connectionDeduction = twoWayDeduction + threeWayDeduction;
  const grossPanelWidth=req.total_width-endDeduction-connectionDeduction;
  let allocationWidth,pieces,placements=[],sleevePanels=[],transomPanels=[];
  if(req.placement_mode==='span'){
    const basePieces=buildBasePanels(grossPanelWidth,req.min_panel_width);
    const used=new Set();
    placements=(req.placements||[]).map(x=>{
      if(!Number.isInteger(x.span)||x.span<1||x.span>basePieces.length)throw new Error(`${x.label} ${x.hand}の配置スパンを選択してください`);
      if(used.has(x.span))throw new Error(`${x.span}スパン目に複数のドアが指定されています`);used.add(x.span);
      const original=basePieces[x.span-1],sleeveWidth=original.width-x.width,panelHeight=req.ch-req.panel_height_deduction,transomHeight=Math.max(0,panelHeight-x.height);
      if(sleeveWidth<0)throw new Error(`${x.span}スパン目（W${original.width}）より${x.label}（W${x.width}）が大きいため配置できません`);
      const sleeve=sleeveWidth>0?{type:'sleeve',width:sleeveWidth,height:panelHeight,span:x.span,door_id:x.id}:null;
      const transom=transomHeight>0?{type:'transom',width:x.width,height:transomHeight,span:x.span,door_id:x.id}:null;
      if(sleeve)sleevePanels.push(sleeve);if(transom)transomPanels.push(transom);
      return {...x,original_width:original.width,sleeve_width:sleeveWidth,sleeve_height:panelHeight,transom_width:x.width,transom_height:transomHeight};
    });
    const pmap=new Map(placements.map(x=>[x.span,x]));pieces=[];
    basePieces.forEach((p,i)=>{const x=pmap.get(i+1);if(!x){pieces.push({...p,span:i+1});return;}pieces.push({type:'door',width:x.width,height:x.height,span:i+1,door:x});if(x.sleeve_width>0)pieces.push({type:'sleeve',width:x.sleeve_width,height:x.sleeve_height,span:i+1,door:x});});
    // 袖幅と隣接パネルを1枚（最大W1200）にまとめられる場合は、袖を独立部材にしない。
    const mergeable=p=>p&&['1200','900','adjustment'].includes(p.type);
    for(let i=0;i<pieces.length;i++){
      const sleeve=pieces[i];if(sleeve.type!=='sleeve')continue;
      const right=pieces[i+1],left=pieces[i-2],door=pieces[i-1];
      let neighbor=null,side='';
      if(mergeable(right)&&sleeve.width+right.width<=1200){neighbor=right;side='right';}
      else if(door?.type==='door'&&mergeable(left)&&sleeve.width+left.width<=1200){neighbor=left;side='left';}
      if(!neighbor)continue;
      const mergedWidth=sleeve.width+neighbor.width;
      if(mergedWidth<req.min_panel_width)continue;
      const mergedType=mergedWidth===1200?'1200':(mergedWidth===900?'900':'adjustment');
      const target=placements.find(x=>x.id===sleeve.door.id);
      if(target){target.sleeve_merged=true;target.merged_panel_width=mergedWidth;target.merged_from=`${sleeve.width}+${neighbor.width}`;target.merged_side=side;target.sleeve_width=0;}
      sleevePanels=sleevePanels.filter(x=>x.door_id!==sleeve.door.id);
      const merged={type:mergedType,width:mergedWidth,span:neighbor.span,optimized_from:`袖${sleeve.width}+${neighbor.width}`};
      if(side==='right')pieces.splice(i,2,merged);
      else pieces.splice(i-2,3,merged,door);
      i=-1;
    }
    allocationWidth=grossPanelWidth;
  }else{
    allocationWidth=grossPanelWidth-req.door_deduction;
    if(allocationWidth<=0)throw new Error('控除後の割付対象幅が0以下です。ドア開口幅と数量を確認してください');
    pieces=buildBasePanels(allocationWidth,req.min_panel_width).map((p,i)=>({...p,span:i+1}));
  }
  const count1200=pieces.filter(p=>p.type==='1200').length,count900=pieces.filter(p=>p.type==='900').length;
  const adjustments=pieces.filter(p=>p.type==='adjustment'),adjustmentCount=adjustments.length,adjustmentWidth=adjustments[0]?.width||0;
  const panelCount=count1200+count900+adjustmentCount+sleevePanels.length+transomPanels.length;
  const reconstructed=pieces.reduce((sum,p)=>sum+p.width,0);
  const difference=allocationWidth-reconstructed;
  const panelHeight = req.ch - req.panel_height_deduction;
  const doors = req.doors.map(d => ({...d, opening_total:d.qty*d.width, item_name:`${d.label}一式`}));
  return {
    product:req.product, product_name:req.product === 'PL' ? 'アルミパーティション' : 'スチールパーティション', shape:req.shape, input:req, doors, placements, sleeve_panels:sleevePanels, transom_panels:transomPanels,
    counts:{end:endCount,two_way:twoWay,three_way:threeWay,panel_1200:count1200,panel_900:count900,adjustment:adjustmentCount,total_panels:panelCount},
    dimensions:{total_width:req.total_width,allocation_width:allocationWidth,gross_panel_width:grossPanelWidth,end_unit_deduction:endUnitDeduction,end_deduction:endDeduction,two_way_deduction:twoWayDeduction,three_way_deduction:threeWayDeduction,connection_deduction:connectionDeduction,door_opening_total:req.door_opening_total,door_deduction:req.door_deduction,initial_remainder:allocationWidth%1200,adjustment_width:adjustmentWidth,panel_height:panelHeight,end_length:req.ch,difference},
    pieces,
    formula:req.placement_mode==='span'?{label:'総幅 − END数×（END幅−入り込み）− 接続控除（ドアは指定スパン内で置換）',expression:`${req.total_width.toLocaleString()} − ${endCount}×(${req.end_width}−${req.insertion}) − ${connectionDeduction.toLocaleString()}`,result:allocationWidth}:{label:'総幅 − END数×（END幅−入り込み）− ドア控除 − 接続控除',expression:`${req.total_width.toLocaleString()} − ${endCount}×(${req.end_width}−${req.insertion}) − ${req.door_deduction.toLocaleString()} − ${connectionDeduction.toLocaleString()}`,result:allocationWidth},
    status:difference===0?'OK':'要確認'
  };
}

function updateDoorSummary() {
  const doors=doorInputs();
  const total=doors.reduce((sum,d)=>sum+(Number.isFinite(d.qty)&&Number.isFinite(d.width)?d.qty*d.width:0),0);
  $('#doorOpeningTotal').textContent=total.toLocaleString();
  const mode=placementMode(),deduct=mode==='bulk'&&selected('doorDeduct')==='はい';
  $('#doorDeductionStatus').textContent=mode==='span'?'指定スパン内で置換':(deduct?`${total.toLocaleString()}mmを割付から控除`:'割付から控除しない');
  $('#doorDeductionStatus').style.color=deduct?'#b06d00':'#087f6b';
}
['#singleDoorLQty','#singleDoorRQty','#parentChildDoorLQty','#parentChildDoorRQty','#doubleDoorLQty','#doubleDoorRQty','#slidingDoorLQty','#slidingDoorRQty'].forEach(id=>$(id).addEventListener('input',updatePlacementUI));
['#singleDoorWidth','#singleDoorHeight','#parentChildDoorWidth','#parentChildDoorHeight','#doubleDoorWidth','#doubleDoorHeight','#slidingDoorWidth','#slidingDoorHeight','#totalWidth','#endWidth','#insertion','#minPanel'].forEach(id=>$(id).addEventListener('input',updatePlacementUI));
$$('input[name="doorDeduct"]').forEach(n=>n.addEventListener('change',updateDoorSummary));
$$('input[name="doorPlacementMode"],input[name="product"],input[name="shape"]').forEach(n=>n.addEventListener('change',updatePlacementUI));

function normalizeOcr(text){return text.replace(/[，]/g,',').replace(/[：]/g,':').replace(/[Ｏ〇]/g,'0').replace(/[Ｉｌ]/g,'1');}
function inferFromText(raw){
  const text=normalizeOcr(raw);let shape=null;
  if(/スクエア|四角|□/.test(text))shape='スクエア';else if(/T\s*字|Ｔ\s*字/i.test(text))shape='T字';else if(/L\s*字|Ｌ\s*字/i.test(text))shape='L';else if(/直線/.test(text))shape='直線';
  const product=/\bSW\b|ＳＷ/i.test(text)?'SW':(/\bPL\b|ＰＬ/i.test(text)?'PL':null);
  const chMatch=text.match(/(?:CH|ＣＨ|天井高)\s*[:：]?\s*(\d{3,5})/i);const ch=chMatch?+chMatch[1]:null;
  const numbers=[...text.matchAll(/(?<!\d)(\d{3,5}(?:,\d{3})?)(?!\d)/g)].map(m=>+m[1].replace(/,/g,''));
  const plausible=numbers.filter(n=>n>=300&&n<=30000);const widths=plausible.filter(n=>n!==ch);const totalWidth=widths.length?Math.max(...widths):null;
  let score=.25+(totalWidth?.25:0)+(ch?.25:0)+(product?.1:0)+(shape?.1:0);return{shape,product,total_width:totalWidth,ch,confidence:Math.min(.9,score)};
}
async function analyzeFile(file){
  if(!file)return;if(file.size>20*1024*1024){toast('20MB以下のファイルを選択してください');return}if(!file.type.startsWith('image/')){toast('GitHub Pages版はJPG・PNG画像に対応しています');return}
  els.empty.classList.add('hidden');els.preview.classList.remove('hidden');els.image.classList.remove('hidden');const objectUrl=URL.createObjectURL(file);els.image.src=objectUrl;els.badge.textContent='OCR解析中';els.badge.classList.remove('muted');els.note.className='notice';els.note.innerHTML='<b>端末内で画像を解析しています</b><span>画像は外部サーバーへ送信しません。初回はOCRの読込に時間がかかります。</span>';
  try{if(!window.Tesseract)throw new Error('OCRライブラリを読み込めませんでした');const{data}=await Tesseract.recognize(file,'jpn+eng',{logger:m=>{if(m.status==='recognizing text')els.badge.textContent=`OCR ${Math.round((m.progress||0)*100)}%`}});const parsed=inferFromText(data.text||'');if(parsed.total_width){$('#totalWidth').value=parsed.total_width;$('#widthCheck').textContent='OCR候補'}if(parsed.ch){$('#ch').value=parsed.ch;$('#chCheck').textContent='OCR候補'}if(parsed.product)setSelected('product',parsed.product);if(parsed.shape)setSelected('shape',parsed.shape);const pct=Math.round(parsed.confidence*100);els.badge.textContent=`OCR ${pct}%`;els.note.className='notice warn';els.note.innerHTML='<b>読取候補を反映しました</b><span>必ず元図面と寸法・CH・製品・形状・ドアを照合してから計算してください。</span>';$$('.step').forEach(x=>x.classList.toggle('active',x.dataset.step==='2'));toast('OCR読取候補を反映しました')}catch(e){els.badge.textContent='OCRエラー';els.note.className='notice warn';els.note.innerHTML=`<b>自動読取できませんでした</b><span>${e.message}。手入力でそのまま計算できます。</span>`}finally{URL.revokeObjectURL(objectUrl)}
}
els.file.addEventListener('change',e=>analyzeFile(e.target.files[0]));['dragenter','dragover'].forEach(ev=>els.drop.addEventListener(ev,e=>{e.preventDefault();els.drop.classList.add('drag')}));['dragleave','drop'].forEach(ev=>els.drop.addEventListener(ev,e=>{e.preventDefault();els.drop.classList.remove('drag')}));els.drop.addEventListener('drop',e=>analyzeFile(e.dataTransfer.files[0]));
$('#resetBtn').addEventListener('click',()=>{els.file.value='';els.empty.classList.remove('hidden');els.preview.classList.add('hidden');els.result.classList.add('hidden');els.badge.textContent='OCR未解析';els.badge.classList.add('muted');els.note.className='notice';els.note.innerHTML='<b>図面を追加してください</b><span>読取後も、必ず図面と照合してから計算してください。</span>'});

function doorSvg(hand,kind){
  const mirror=hand==='R'?'translate(60 0) scale(-1 1)':'';
  if(kind==='sliding')return `<svg viewBox="0 0 60 42" role="img" aria-label="引き戸 ${hand}"><g transform="${mirror}"><path class="door-wall" d="M2 40h56"/><path class="door-leaf" d="M13 12V37M13 14H43V37"/><path class="door-arc" d="M39 24H19M19 24l6-5M19 24l6 5"/></g></svg>`;
  if(kind==='double')return `<svg viewBox="0 0 60 42" role="img" aria-label="両開き ${hand}"><g transform="${mirror}"><path class="door-wall" d="M2 40h56"/><path class="door-leaf" d="M10 40V8M10 40L30 12M50 40L30 12"/><path class="door-arc" d="M10 8A32 32 0 0 1 42 40M50 8A32 32 0 0 0 18 40"/></g></svg>`;
  if(kind==='parent_child')return `<svg viewBox="0 0 60 42" role="img" aria-label="親子 ${hand}"><g transform="${mirror}"><path class="door-wall" d="M2 40h56"/><path class="door-leaf" d="M10 40V8M10 40L42 20M50 40V24M50 40L42 34"/><path class="door-arc" d="M10 8A32 32 0 0 1 42 40"/></g></svg>`;
  return `<svg viewBox="0 0 60 42" role="img" aria-label="片開き ${hand}"><g transform="${mirror}"><path class="door-wall" d="M2 40h56"/><path class="door-leaf" d="M10 40V8M10 40L42 20"/><path class="door-arc" d="M10 8A32 32 0 0 1 42 40"/></g></svg>`;
}
function renderDoorSymbols(doors,placements=[]){
  const active=placements.length?placements.map(x=>({d:{key:x.key,label:x.label,width:x.width,height:x.height,unit:x.unit},hand:x.hand,qty:1,span:x.span,sleeve:x.sleeve_width})):doors.flatMap(d=>[['L',d.l_qty],['R',d.r_qty]].filter(x=>x[1]>0).map(([hand,qty])=>({d,hand,qty})));
  $('#doorSymbols').innerHTML=active.length?active.map(({d,hand,qty,span,sleeve})=>`<div class="door-symbol-card">${doorSvg(hand,d.key)}<div><b>${d.label} ${hand}</b><span>${span?`${span}スパン目・`:''}${qty}${d.unit}・W${d.width}×H${d.height}${sleeve?`・袖W${sleeve}`:''}${span&&placements.find(x=>x.span===span&&x.hand===hand&&x.key===d.key)?.sleeve_merged?`・袖は隣接パネルへ統合`:''}</span></div></div>`).join(''):'<span class="door-card-empty">ドア選択時に、平面図形式のL／R記号を表示します。</span>';
}

function render(result){
  lastResult=result;$('#allocationWidth').textContent=result.dimensions.allocation_width.toLocaleString();$('#productName').textContent=`${result.product} / ${result.product_name}`;$('#statusPill').textContent=result.status==='OK'?'CHECKED':'REVIEW';
  const bar=$('#partitionBar');bar.innerHTML='';result.pieces.forEach(p=>{const d=document.createElement('div');d.className=`partition-piece p${p.type} ${p.type}`;d.style.flex=`${p.width} 1 0`;d.innerHTML=p.type==='door'?`${p.door.label}<small>${p.door.hand}・${p.door.span}スパン</small>`:(p.type==='sleeve'?`袖 ${p.width}`:(p.type==='adjustment'?`調整 ${p.width}`:p.width));bar.appendChild(d)});
  $('#partitionLegend').innerHTML='<span><i style="background:#cce7ef"></i>W1200</span><span><i style="background:#bde6dc"></i>W900</span><span><i style="background:#ffe2a9"></i>調整</span><span><i class="door-legend"></i>ドア</span><span><i class="sleeve-legend"></i>袖パネル</span>';
  const baseItems=[['W1200',result.counts.panel_1200,'枚',''],['W900',result.counts.panel_900,'枚',''],['調整',result.counts.adjustment,result.dimensions.adjustment_width?`${result.dimensions.adjustment_width}mm`:'不要',''],['END',result.counts.end,'本',''],['2WAY',result.counts.two_way,'個',''],['3WAY',result.counts.three_way,'個','']];
  const doorItems=result.doors.flatMap(d=>[
    [`${d.label} L`,d.l_qty,d.unit,'door-part'],[`${d.label} R`,d.r_qty,d.unit,'door-part']
  ]);
  const sleeveItems=result.sleeve_panels.map((p,i)=>[`袖パネル ${i+1}`,1,`W${p.width}×H${p.height}`,'sleeve-part']);
  const transomItems=result.transom_panels.map((p,i)=>[`欄間パネル ${i+1}`,1,`W${p.width}×H${p.height}`,'sleeve-part']);
  const items=[...baseItems,...doorItems,...sleeveItems,...transomItems];
  $('#partsGrid').innerHTML=items.map(x=>`<div class="part ${x[3]}"><span>${x[0]}</span><strong>${x[1]}</strong><small>${x[2]}</small></div>`).join('')+'<div class="door-result-note">L／Rは平面図上の開き勝手です。引き戸はL＝左引き、R＝右引きです。指定スパンをドアへ置換し、袖幅と隣接パネルをW1200以内の1枚にまとめられる場合は袖を自動統合します。ドア詳細部材は仮マスタです。</div>';
  renderDoorSymbols(result.doors,result.placements);
  $('#formulaLabel').textContent=result.formula.label;$('#formulaExpression').textContent=`${result.formula.expression} ＝ ${result.formula.result.toLocaleString()}mm`;
  $('#deductionGrid').innerHTML=[['END控除',result.dimensions.end_deduction],['接続控除',result.dimensions.connection_deduction],['ドア控除',result.dimensions.door_deduction]].map(x=>`<div><span>${x[0]}</span><b>${x[1].toLocaleString()}mm</b></div>`).join('');
  els.result.classList.remove('hidden');$$('.step').forEach(x=>x.classList.toggle('active',x.dataset.step==='3'));els.result.scrollIntoView({behavior:'smooth',block:'start'});
}
els.calculate.addEventListener('click',()=>{els.calculate.disabled=true;els.calculate.querySelector('span').textContent='計算中…';try{render(calculate(payload()))}catch(e){toast(e.message||'入力内容を確認してください')}finally{els.calculate.disabled=false;els.calculate.querySelector('span').textContent='拾い出しを実行'}});

async function exportExcel(){
  if(!lastResult)lastResult=calculate(payload());if(!window.ExcelJS)throw new Error('Excel出力機能を読み込めませんでした');const r=lastResult,wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('拾い出し結果',{views:[{showGridLines:false}]});ws.columns=[{width:3},{width:24},{width:22},{width:22},{width:24},{width:3}];
  ws.mergeCells('B2:E3');const title=ws.getCell('B2');title.value='パーテーション 拾い出し結果';title.font={name:'Arial',size:20,bold:true,color:{argb:'FFFFFFFF'}};title.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF163A5F'}};title.alignment={horizontal:'center',vertical:'middle'};
  const rows=[['製品',`${r.product}（${r.product_name}）`],['形状',r.shape],['総幅',r.dimensions.total_width],['割付対象幅',r.dimensions.allocation_width],['CH',r.input.ch],['END',r.counts.end],['2WAY',r.counts.two_way],['3WAY',r.counts.three_way],['W1200',r.counts.panel_1200],['W900',r.counts.panel_900],['調整パネル',r.counts.adjustment],['調整幅',r.dimensions.adjustment_width],
    ...r.doors.flatMap(d=>[[`${d.label} L 数量`,d.l_qty],[`${d.label} R 数量`,d.r_qty],[`${d.label} 開口幅`,d.width],[`${d.label} 開口高`,d.height]]),
    ...r.placements.flatMap((x,i)=>[[`ドア配置 ${i+1}`,`${x.span}スパン目 ${x.label} ${x.hand}`],[`袖パネル ${i+1}`,x.sleeve_merged?`不要（${x.merged_from}→W${x.merged_panel_width}パネルへ統合）`:(x.sleeve_width?`W${x.sleeve_width}×H${x.sleeve_height}`:'なし')],[`欄間パネル ${i+1}`,x.transom_height?`W${x.transom_width}×H${x.transom_height}`:'なし']]),
    ['ドア開口幅合計',r.dimensions.door_opening_total],['割付からのドア控除',r.dimensions.door_deduction]];
  rows.forEach((row,i)=>{const rr=5+i;ws.getCell(`B${rr}`).value=row[0];ws.getCell(`C${rr}`).value=row[1];['B','C'].forEach(c=>{ws.getCell(`${c}${rr}`).border={top:{style:'thin',color:{argb:'FFB7C9D6'}},left:{style:'thin',color:{argb:'FFB7C9D6'}},bottom:{style:'thin',color:{argb:'FFB7C9D6'}},right:{style:'thin',color:{argb:'FFB7C9D6'}}}});ws.getCell(`B${rr}`).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFD9EAF7'}};ws.getCell(`B${rr}`).font={bold:true};ws.getCell(`C${rr}`).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE2F0D9'}};ws.getCell(`C${rr}`).font={bold:true}});
  const calcRow=rows.length+6;ws.mergeCells(`B${calcRow}:E${calcRow}`);ws.getCell(`B${calcRow}`).value='計算根拠';ws.getCell(`B${calcRow}`).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1F4E78'}};ws.getCell(`B${calcRow}`).font={bold:true,color:{argb:'FFFFFFFF'}};ws.getCell(`B${calcRow}`).alignment={horizontal:'center'};ws.mergeCells(`B${calcRow+1}:E${calcRow+3}`);ws.getCell(`B${calcRow+1}`).value=`${r.formula.label}\n${r.formula.expression} ＝ ${r.formula.result.toLocaleString()}mm\n※ドア詳細部材は仮マスタ・要確認`;ws.getCell(`B${calcRow+1}`).alignment={wrapText:true,vertical:'middle',horizontal:'center'};ws.getCell(`B${calcRow+1}`).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFF2CC'}};
  const buffer=await wb.xlsx.writeBuffer();const blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='パーテーション拾い出し結果_ドア対応.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('ドアを含むExcelを出力しました');
}
$('#exportBtn').addEventListener('click',async()=>{try{await exportExcel()}catch(e){toast(e.message)}});
$('#copyBtn').addEventListener('click',async()=>{if(!lastResult)return;const r=lastResult;const doorText=r.placements.length?r.placements.map(x=>`${x.span}スパン目:${x.label}${x.hand}${x.sleeve_merged?`+袖統合W${x.merged_panel_width}`:(x.sleeve_width?`+袖W${x.sleeve_width}`:'')}${x.transom_height?`+欄間H${x.transom_height}`:''}`).join('、'):r.doors.flatMap(d=>[['L',d.l_qty],['R',d.r_qty]].filter(x=>x[1]>0).map(([h,q])=>`${d.label}${h}×${q}${d.unit}`)).join('、')||'ドアなし';const text=`${r.product} ${r.shape} / 割付対象幅 ${r.dimensions.allocation_width}mm / W1200×${r.counts.panel_1200}、W900×${r.counts.panel_900}、調整${r.dimensions.adjustment_width}mm×${r.counts.adjustment}、END×${r.counts.end}、2WAY×${r.counts.two_way}、3WAY×${r.counts.three_way} / ${doorText}`;await navigator.clipboard.writeText(text);toast('結果をコピーしました')});

updatePlacementUI();
window.WALLFIT={calculate,buildBasePanels,SHAPES,DOOR_MASTER};
