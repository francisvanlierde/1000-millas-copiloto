import { store } from "../store.js";

const CAP = 100; // tope de puntos por control, segun reglamento

export function initScore(){
  const state = store.state;

  const dayTabsEl = document.getElementById("scoreDayTabs");
  const listEl = document.getElementById("scoreList");
  const summaryEl = document.getElementById("summary");
  const noteEl = document.getElementById("descarteNote");
  const shareBtn = document.getElementById("shareBtn");
  const shareStatus = document.getElementById("shareStatus");

  function activeDay(){
    if(!state.days[state.ui.activeDayScore]) state.ui.activeDayScore = Object.keys(state.days)[0];
    return state.ui.activeDayScore;
  }
  function results(day){ return state.carrera.pcResults[day] || []; }
  function aplicaDescarte(day){
    const meta = state.diasMeta[day];
    return !meta || meta.aplicaDescarte !== false;
  }
  function puntos(delta){ return Math.min(CAP, Math.round(Math.abs(delta) * 100)); }

  function renderTabs(){
    dayTabsEl.innerHTML = "";
    Object.keys(state.days).forEach(name => {
      const b = document.createElement("button");
      b.className = "daytab" + (name === activeDay() ? " active" : "");
      b.textContent = name;
      b.onclick = () => { state.ui.activeDayScore = name; renderAll(); };
      dayTabsEl.appendChild(b);
    });
  }

  function renderNote(){
    noteEl.innerHTML = "";
    if(!aplicaDescarte(activeDay())){
      const n = document.createElement("div");
      n.className = "noDescarteNote";
      n.textContent = "Esta etapa no aplica descarte — todos los PC suman.";
      noteEl.appendChild(n);
    }
  }

  function renderList(){
    const day = activeDay();
    const pcs = results(day);
    listEl.innerHTML = "";

    if(!pcs.length){
      const empty = document.createElement("div");
      empty.className = "score-empty";
      empty.textContent = "Todavía no se corrió ningún PC en esta etapa.";
      listEl.appendChild(empty);
      return;
    }

    let peorIdx = -1;
    if(aplicaDescarte(day) && pcs.length){
      let max = -1;
      pcs.forEach((p, i) => { const pts = puntos(p.delta); if(pts > max){ max = pts; peorIdx = i; } });
    }

    pcs.forEach((p, idx) => {
      const isDescartada = idx === peorIdx;
      const row = document.createElement("div");
      row.className = "srow" + (isDescartada ? " descartada" : "");

      const num = document.createElement("div");
      num.className = "pcnum";
      num.textContent = p.pc;

      const deltacol = document.createElement("div");
      deltacol.className = "deltacol";
      const delta = document.createElement("span");
      const sign = p.delta >= 0 ? "+" : "";
      delta.className = "delta " + (p.delta >= 0 ? "pos" : "neg");
      delta.textContent = sign + p.delta.toFixed(2) + "s";
      const dl = document.createElement("span");
      dl.className = "deltalabel";
      dl.textContent = p.delta >= 0 ? "adelantado" : "atrasado";
      deltacol.appendChild(delta); deltacol.appendChild(dl);

      const pointscol = document.createElement("div");
      pointscol.className = "pointscol";
      const pts = puntos(p.delta);
      const ptsEl = document.createElement("span");
      ptsEl.className = "points";
      ptsEl.textContent = pts;
      const ptsLbl = document.createElement("span");
      ptsLbl.className = "pointslabel";
      ptsLbl.textContent = "pts";
      pointscol.appendChild(ptsEl); pointscol.appendChild(ptsLbl);
      if(Math.abs(p.delta) * 100 > CAP){
        const tope = document.createElement("div");
        tope.className = "tope";
        tope.textContent = "tope";
        pointscol.appendChild(tope);
      }

      row.appendChild(num);
      row.appendChild(deltacol);
      row.appendChild(pointscol);

      if(isDescartada){
        const tag = document.createElement("span");
        tag.className = "descartetag";
        tag.textContent = "DESCARTADA";
        row.appendChild(tag);
      }

      listEl.appendChild(row);
    });
  }

  function renderSummary(){
    const day = activeDay();
    const pcs = results(day);
    summaryEl.innerHTML = "";
    if(!pcs.length) return;

    const deltas = pcs.map(p => p.delta);
    const puntosPorPc = pcs.map(p => puntos(p.delta));
    const bruto = puntosPorPc.reduce((a,b) => a+b, 0);
    let neto = bruto;
    if(aplicaDescarte(day) && puntosPorPc.length){
      neto = bruto - Math.max(...puntosPorPc);
    }

    const cantidad = deltas.length;
    const promedioAbs = cantidad ? (deltas.reduce((a,b) => a+Math.abs(b), 0) / cantidad) : 0;
    const promedioSigned = cantidad ? (deltas.reduce((a,b) => a+b, 0) / cantidad) : 0;
    let menorIdx = 0;
    pcs.forEach((p, i) => { if(Math.abs(p.delta) < Math.abs(pcs[menorIdx].delta)) menorIdx = i; });
    const menor = pcs[menorIdx];

    const row1 = document.createElement("div");
    row1.className = "sumrow";
    row1.innerHTML = '<span class="sumlabel">Total bruto</span><span class="sumvalue">' + bruto + ' pts</span>';
    const div1 = document.createElement("div");
    div1.className = "divider";
    const row2 = document.createElement("div");
    row2.className = "sumrow";
    row2.innerHTML = '<span class="sumlabel">Total neto (con descarte)</span><span class="sumvalue final">' + neto + ' pts</span>';

    const div2 = document.createElement("div");
    div2.className = "divider";

    const row3 = document.createElement("div");
    row3.className = "sumrow";
    row3.innerHTML = '<span class="sumlabel">Cantidad de PC</span><span class="sumvalue">' + cantidad + '</span>';

    const row4 = document.createElement("div");
    row4.className = "sumrow";
    const tendSign = promedioSigned >= 0 ? "+" : "-";
    const tendClass = promedioSigned >= 0 ? "pos" : "neg";
    const tendTexto = promedioSigned >= 0 ? "adelantado" : "atrasado";
    row4.innerHTML = '<span class="sumlabel">Promedio de desvío</span>' +
      '<span class="sumvalue-group">' +
        '<span class="sumvalue ' + tendClass + '">' + tendSign + promedioAbs.toFixed(2) + 's</span>' +
        '<span class="deltalabel" style="color:' + (promedioSigned>=0?'var(--green)':'var(--red)') + ';">' + tendTexto + '</span>' +
      '</span>';

    const row5 = document.createElement("div");
    row5.className = "sumrow";
    const menorSign = menor.delta >= 0 ? "+" : "";
    row5.innerHTML = '<span class="sumlabel">Menor delta</span><span class="sumvalue">' + menor.pc + ' · ' + menorSign + menor.delta.toFixed(2) + 's</span>';

    summaryEl.appendChild(row1);
    summaryEl.appendChild(div1);
    summaryEl.appendChild(row2);
    summaryEl.appendChild(div2);
    summaryEl.appendChild(row3);
    summaryEl.appendChild(row4);
    summaryEl.appendChild(row5);
  }

  function renderAll(){ renderTabs(); renderNote(); renderList(); renderSummary(); }

  function buildShareText(){
    const day = activeDay();
    const pcs = results(day);
    const numeroAuto = state.ajustes.numeroAuto || "";
    if(!pcs.length) return "🏁 Auto " + numeroAuto + " — " + day + " — Todavía no hay resultados.";

    const deltas = pcs.map(p => p.delta);
    const puntosPorPc = pcs.map(p => puntos(p.delta));
    const bruto = puntosPorPc.reduce((a,b) => a+b, 0);
    let peorIdx = -1;
    if(aplicaDescarte(day) && puntosPorPc.length){
      let max = -1;
      puntosPorPc.forEach((pt,i) => { if(pt>max){max=pt; peorIdx=i;} });
    }
    const neto = aplicaDescarte(day) ? bruto - Math.max(...puntosPorPc) : bruto;
    const promedioAbs = deltas.reduce((a,b) => a+Math.abs(b), 0) / deltas.length;
    const promedioSigned = deltas.reduce((a,b) => a+b, 0) / deltas.length;
    const tendencia = promedioSigned === 0 ? "parejo" : (promedioSigned > 0 ? "adelantado" : "atrasado");

    let lines = [];
    lines.push("🏁 Auto " + numeroAuto + " — " + day + " — Resultados");
    lines.push("");
    pcs.forEach((p, idx) => {
      const sign = p.delta >= 0 ? "+" : "";
      const marca = idx === peorIdx ? " (descartada)" : "";
      lines.push(p.pc + ": " + sign + p.delta.toFixed(2) + "s · " + puntos(p.delta) + " pts" + marca);
    });
    lines.push("");
    lines.push("Total bruto: " + bruto + " pts");
    lines.push("Total neto: " + neto + " pts");
    lines.push("Promedio de desvío: " + promedioAbs.toFixed(2) + "s (" + tendencia + ")");
    return lines.join("\n");
  }

  function flashStatus(msg){
    shareStatus.textContent = msg;
    clearTimeout(flashStatus._t);
    flashStatus._t = setTimeout(() => { shareStatus.textContent = ""; }, 2500);
  }

  shareBtn.onclick = async () => {
    const text = buildShareText();
    if(navigator.share){
      try{
        await navigator.share({ text });
        flashStatus("Compartido.");
        return;
      }catch(e){ /* el usuario cancelo el panel nativo, seguimos al fallback */ }
    }
    try{
      await navigator.clipboard.writeText(text);
      flashStatus("Copiado — pegalo en WhatsApp.");
    }catch(e){
      flashStatus("No se pudo copiar automáticamente en este navegador.");
    }
  };

  return {
    show(){ renderAll(); },
    hide(){}
  };
}
