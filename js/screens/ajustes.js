import { store } from "../store.js";
import { openTimePad } from "../timepad.js";
import { hhmmssToMs, todayMidnightMs } from "../engine.js";

// Tabla simplificada de coeficientes por año, igual que en el mockup original.
function coefForYear(year){
  const y = parseInt(year, 10);
  if(isNaN(y)) return "—";
  if(y < 1931) return "1.60";
  if(y < 1946) return "1.50";
  if(y < 1958) return "1.40";
  if(y < 1966) return "1.30";
  if(y < 1973) return "1.20";
  return "1.00";
}

function esMismoDia(a, b){
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

export function initAjustes(){
  const state = store.state;

  const numeroInput = document.getElementById("numeroInput");
  const anioInput = document.getElementById("anioInput");
  const coefValue = document.getElementById("coefValue");
  const metodoSelect = document.getElementById("metodoSelect");
  const calBtn = document.getElementById("calBtn");
  const calStatus = document.getElementById("calStatus");
  const dualSwitch = document.getElementById("dualSwitch");
  const tolItem = document.getElementById("tolItem");
  const tolInput = document.getElementById("tolInput");
  const pairCopiloto = document.getElementById("pairCopiloto");
  const pairPilotoItem = document.getElementById("pairPilotoItem");
  const pairPiloto = document.getElementById("pairPiloto");
  const umbralInput = document.getElementById("umbralInput");
  const wipeBtn = document.getElementById("wipeBtn");

  function render(){
    const a = state.ajustes;
    numeroInput.value = a.numeroAuto;
    anioInput.value = a.anioAuto;
    coefValue.textContent = coefForYear(a.anioAuto);
    metodoSelect.value = a.metodoSync;

    if(a.calibradoAt && esMismoDia(a.calibradoAt, Date.now())){
      const d = new Date(a.calibradoAt);
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      const offsetSeg = (a.clockOffsetMs / 1000).toFixed(2);
      const sign = a.clockOffsetMs >= 0 ? "+" : "";
      calStatus.innerHTML = '<span class="dot"></span><span>Calibrado hoy a las ' + hh + ':' + mm + ' · offset ' + sign + offsetSeg + 's</span>';
    } else {
      calStatus.innerHTML = '<span class="dot off"></span><span>Todavía no calibraste hoy</span>';
    }

    dualSwitch.className = "switch" + (a.dualPulsadores ? " on" : "");
    tolItem.className = "item" + (a.dualPulsadores ? "" : " disabled");
    pairPilotoItem.className = "item" + (a.dualPulsadores ? "" : " disabled");
    tolInput.value = a.toleranciaMs;

    pairCopiloto.className = "pairbtn" + (a.pulsadorCopilotoConectado ? " connected" : "");
    pairCopiloto.textContent = a.pulsadorCopilotoConectado ? "Conectado" : "Sin señal";

    pairPiloto.className = "pairbtn" + (a.pulsadorPilotoConectado ? " connected" : "");
    pairPiloto.textContent = a.pulsadorPilotoConectado ? "Conectado" : "Emparejar";

    umbralInput.value = a.umbralChicharraSeg;
  }

  numeroInput.oninput = () => { state.ajustes.numeroAuto = numeroInput.value; store.notify(); };
  anioInput.oninput = () => {
    state.ajustes.anioAuto = anioInput.value;
    coefValue.textContent = coefForYear(anioInput.value);
    store.notify();
  };
  metodoSelect.onchange = () => { state.ajustes.metodoSync = metodoSelect.value; store.notify(); };

  calBtn.onclick = () => {
    const now = new Date();
    const buffer = String(now.getHours()).padStart(2,"0") + String(now.getMinutes()).padStart(2,"0") + String(now.getSeconds()).padStart(2,"0");
    openTimePad("Hora oficial actual", buffer, (val) => {
      const horaOficialMs = todayMidnightMs() + hhmmssToMs(val);
      state.ajustes.clockOffsetMs = horaOficialMs - Date.now();
      state.ajustes.calibradoAt = Date.now();
      store.notify();
      render();
    });
  };

  dualSwitch.onclick = () => {
    state.ajustes.dualPulsadores = !state.ajustes.dualPulsadores;
    store.notify();
    render();
  };

  tolInput.oninput = () => {
    const n = parseInt(tolInput.value, 10);
    state.ajustes.toleranciaMs = isNaN(n) ? 0 : n;
    store.notify();
  };

  pairPiloto.onclick = () => {
    state.ajustes.pulsadorPilotoConectado = !state.ajustes.pulsadorPilotoConectado;
    store.notify();
    render();
  };

  umbralInput.oninput = () => {
    const n = parseInt(umbralInput.value, 10);
    state.ajustes.umbralChicharraSeg = isNaN(n) ? 0 : n;
    store.notify();
  };

  wipeBtn.onclick = () => {
    const ok = window.confirm("¿Eliminar toda la hoja de ruta, horarios y resultados cargados? Esta acción no se puede deshacer.");
    if(!ok) return;
    store.resetRaceData();
    render();
  };

  return {
    show(){ render(); },
    hide(){}
  };
}
