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

// Nombres legibles para los codigos de tecla mas comunes que mandan los
// pulsadores Bluetooth tipo "control remoto" (se emparejan como teclado a
// nivel sistema operativo, asi que a la app le llegan como keydown normales).
const KEY_LABELS = {
  Space: "Espacio", Enter: "Enter", Escape: "Escape", Tab: "Tab",
  ArrowLeft: "Flecha izquierda", ArrowRight: "Flecha derecha",
  ArrowUp: "Flecha arriba", ArrowDown: "Flecha abajo",
  PageUp: "Av Pág", PageDown: "Re Pág",
  AudioVolumeUp: "Volumen +", AudioVolumeDown: "Volumen -"
};
function keyLabel(code){
  return KEY_LABELS[code] || code;
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
  const pairPiloto = document.getElementById("pairPiloto");
  const umbralInput = document.getElementById("umbralInput");
  const wipeBtn = document.getElementById("wipeBtn");

  // Mientras se espera el toque del pulsador para emparejarlo, el boton
  // muestra "Presioná el botón…" — render() no debe pisar ese texto.
  let capturing = null; // "copiloto" | "piloto" | null
  let captureTimeoutId = null;

  function renderPairBtn(btn, key, role){
    if(capturing === role) return;
    btn.className = "pairbtn" + (key ? " connected" : "");
    btn.textContent = key ? "Conectado (" + keyLabel(key) + ")" : "Emparejar";
  }

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
    tolInput.value = a.toleranciaMs;

    renderPairBtn(pairCopiloto, a.pulsadorCopilotoKey, "copiloto");
    renderPairBtn(pairPiloto, a.pulsadorPilotoKey, "piloto");

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

  // Emparejar un pulsador es simplemente "esperar el proximo keydown" — el
  // dispositivo Bluetooth ya se emparejo antes a nivel sistema operativo
  // (como un teclado externo), asi que a la app solo le llega un evento de
  // tecla normal cuando el copiloto/piloto lo aprieta.
  function cancelCapture(){
    if(captureTimeoutId){ clearTimeout(captureTimeoutId); captureTimeoutId = null; }
    document.removeEventListener("keydown", onCaptureKey, true);
    capturing = null;
  }

  function onCaptureKey(e){
    e.preventDefault();
    const role = capturing;
    if(!role) return;
    const otherKey = role === "copiloto" ? state.ajustes.pulsadorPilotoKey : state.ajustes.pulsadorCopilotoKey;
    cancelCapture();
    if(otherKey && otherKey === e.code){
      render();
      alert("Ese botón manda la misma tecla (" + keyLabel(e.code) + ") que el otro pulsador ya emparejado. Para poder diferenciarlos necesitás un dispositivo que mande una tecla distinta.");
      return;
    }
    if(role === "copiloto") state.ajustes.pulsadorCopilotoKey = e.code;
    else state.ajustes.pulsadorPilotoKey = e.code;
    store.notify();
    render();
  }

  function startCapture(role, btn){
    cancelCapture();
    capturing = role;
    btn.className = "pairbtn capturing";
    btn.textContent = "Presioná el botón del pulsador…";
    document.addEventListener("keydown", onCaptureKey, true);
    captureTimeoutId = setTimeout(() => {
      cancelCapture();
      render();
      // La causa mas comun de "no detecta nada": el dispositivo manda
      // Volumen +/-, y el sistema operativo se queda con esa tecla antes
      // de que llegue al navegador (no hay forma de destrabar esto desde
      // la pagina web, es una restriccion del SO/navegador).
      alert("No se detectó ninguna tecla en 10 segundos.\n\nSi al presionar el pulsador cambia el volumen del teléfono, la app no puede recibir esa señal — los botones de volumen quedan reservados por el sistema operativo, ninguna página web puede leerlos.\n\nRevisá si el dispositivo tiene un modo alternativo (a veces hay un interruptor \"cámara/presentación\"), o probá con uno que mande una flecha, Enter, o Re Pág/Av Pág.");
    }, 10000);
  }

  pairCopiloto.onclick = () => startCapture("copiloto", pairCopiloto);
  pairPiloto.onclick = () => startCapture("piloto", pairPiloto);

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
    hide(){ cancelCapture(); }
  };
}
