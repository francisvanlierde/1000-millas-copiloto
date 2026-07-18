import { store } from "../store.js";
import { getStatus, nowOficial, iniciarPC, finalizarPC, deshacerUltimoToque } from "../engine.js";

export function initCarrera(){
  const state = store.state;

  const raceContextEl = document.getElementById("raceContext");
  const raceDayTabsEl = document.getElementById("raceDayTabs");
  const labelMainEl = document.getElementById("labelMain");
  const horaAbsEl = document.getElementById("horaAbs");
  const digitsEl = document.getElementById("digits");
  const sublabelEl = document.getElementById("sublabel");
  const bannerEl = document.getElementById("banner");
  const tocarBtn = document.getElementById("tocarBtn");
  const undoBtn = document.getElementById("undoBtn");

  let currentStatus = null;
  let intervalId = null;
  let beepTimeouts = [];
  let beepScheduledForKey = null;

  function activeDay(){
    if(!state.days[state.ui.activeDayCarrera]) state.ui.activeDayCarrera = Object.keys(state.days)[0];
    return state.ui.activeDayCarrera;
  }

  function fmtHora(instant){
    return new Date(instant).toLocaleTimeString("es-AR", {hour:"2-digit", minute:"2-digit", second:"2-digit"});
  }

  function fmtFecha(fechaStr){
    if(!fechaStr) return null;
    const [y, m, d] = fechaStr.split("-");
    return d + "/" + m + "/" + y;
  }

  function formatDigits(remainingMs){
    const ms = remainingMs || 0;
    const neg = ms < 0;
    const totalSeconds = Math.floor(Math.abs(ms) / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    let core;
    if(h > 0) core = h + ":" + String(m).padStart(2,"0") + ":" + String(s).padStart(2,"0");
    else if(m > 0) core = m + ":" + String(s).padStart(2,"0");
    else core = String(s);
    return (neg ? "-" : "") + core;
  }

  let audioCtx = null;
  function beep(freq){
    try{
      if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(); osc.stop(audioCtx.currentTime + 0.13);
    }catch(e){}
  }

  function clearBeeps(){
    beepTimeouts.forEach(id => clearTimeout(id));
    beepTimeouts = [];
    beepScheduledForKey = null;
  }

  // Los beeps se programan una sola vez por PC, con horarios exactos de reloj
  // (no recalculados cuadro a cuadro), igual que la demo original.
  function scheduleBeepsForPC(status){
    if(beepScheduledForKey === status.key) return;
    clearBeeps();
    beepScheduledForKey = status.key;
    const umbral = Math.max(1, state.ajustes.umbralChicharraSeg || 10);
    const offsetMs = state.ajustes.clockOffsetMs || 0;
    const zeroOficial = status.startInstant + status.duracionMs;
    for(let r = umbral - 1; r >= 0; r--){
      const targetOficial = zeroOficial - r * 1000;
      const targetDevice = targetOficial - offsetMs;
      const delay = targetDevice - Date.now();
      if(delay >= 0){
        beepTimeouts.push(setTimeout(() => beep(r <= 0 ? 1400 : 880), delay));
      }
    }
  }

  function renderDayTabs(){
    raceDayTabsEl.innerHTML = "";
    Object.keys(state.days).forEach(day => {
      const b = document.createElement("button");
      b.className = "daytab" + (day === activeDay() ? " active" : "");
      b.textContent = day;
      b.onclick = () => {
        state.ui.activeDayCarrera = day;
        clearBeeps();
        renderDayTabs();
        store.notify();
      };
      raceDayTabsEl.appendChild(b);
    });
  }

  function resetVisual(){
    horaAbsEl.classList.remove("show");
    bannerEl.className = "banner";
    digitsEl.className = "digits";
    tocarBtn.className = "tocar";
    tocarBtn.textContent = "Tocar";
    sublabelEl.textContent = "";
  }

  function render(){
    const day = activeDay();
    const now = nowOficial(state);

    if(!day){
      currentStatus = null;
      raceContextEl.textContent = "Sin etapas cargadas";
      resetVisual();
      labelMainEl.textContent = "";
      digitsEl.textContent = "—";
      sublabelEl.textContent = "Todavía no cargaste ninguna etapa. Andá a Datos y tocá \"+ Etapa\".";
      tocarBtn.className = "tocar disabled";
      clearBeeps();
      return;
    }

    const status = getStatus(day, state, now);
    currentStatus = status;

    const meta = state.diasMeta[day];
    const fechaLabel = fmtFecha(meta && meta.fecha);
    raceContextEl.textContent = day + (fechaLabel ? " · " + fechaLabel : "") + " · " + fmtHora(now);
    resetVisual();

    if(status.kind === "DONE"){
      labelMainEl.textContent = "Etapa completa";
      digitsEl.textContent = "🏁";
      sublabelEl.textContent = "No quedan más controles en este día.";
      tocarBtn.className = "tocar disabled";
      clearBeeps();
      return;
    }

    if(status.kind === "CH" || status.kind === "CS"){
      labelMainEl.textContent = status.label;
      horaAbsEl.textContent = fmtHora(status.scheduled);
      horaAbsEl.classList.add("show");
      digitsEl.textContent = formatDigits(status.remainingMs);
      sublabelEl.textContent = "No es necesario tocar";
      tocarBtn.className = "tocar disabled";
      clearBeeps();
      return;
    }

    // status.kind === "PC"
    labelMainEl.textContent = "PC " + status.pcNumber;

    if(status.needsLargar){
      digitsEl.textContent = formatDigits(status.duracionMs);
      sublabelEl.textContent = "Listo para largar";
      tocarBtn.textContent = "Largar";
      clearBeeps();
      return;
    }

    if(status.needsConfirmPass){
      if(status.scheduledPassInstant != null){
        horaAbsEl.textContent = fmtHora(status.scheduledPassInstant);
        horaAbsEl.classList.add("show");
      }
      digitsEl.textContent = formatDigits(status.remainingMs);
      sublabelEl.textContent = "Confirmá el paso para largar este PC";
      const umbralMs = Math.max(1, state.ajustes.umbralChicharraSeg || 10) * 1000;
      if((status.remainingMs || 0) <= umbralMs){
        bannerEl.textContent = "Debe tocar";
        bannerEl.className = "banner show debe";
        digitsEl.className = "digits critical" + (status.remainingMs < 0 ? " neg" : "");
      }
      clearBeeps();
      return;
    }

    // PC en curso (ya arrancado)
    const umbralMs = Math.max(1, state.ajustes.umbralChicharraSeg || 10) * 1000;
    digitsEl.textContent = formatDigits(status.remainingMs);
    if(status.remainingMs <= umbralMs){
      digitsEl.className = "digits critical" + (status.remainingMs < 0 ? " neg" : "");
    }
    if(status.overdue){
      sublabelEl.textContent = "Tiempo excedido — tocá para finalizar";
      bannerEl.textContent = "Debe tocar";
      bannerEl.className = "banner show debe";
    }
    scheduleBeepsForPC(status);
  }

  tocarBtn.onclick = () => {
    if(!currentStatus || currentStatus.kind !== "PC") return;
    const day = activeDay();
    const now = nowOficial(state);
    if(currentStatus.needsLargar || currentStatus.needsConfirmPass){
      iniciarPC(state, currentStatus.key, now);
      clearBeeps();
      store.notify();
    } else if(currentStatus.running){
      finalizarPC(state, day, currentStatus, now);
      clearBeeps();
      store.notify();
    }
    render();
  };

  undoBtn.onclick = () => {
    const changed = deshacerUltimoToque(state, activeDay());
    if(changed){ clearBeeps(); store.notify(); render(); }
  };

  // setInterval en vez de requestAnimationFrame: rAF se pausa cuando la
  // pestaña pierde foco o la pantalla se bloquea, lo cual sería inaceptable
  // para un cronómetro que se usa en vivo durante la carrera. setInterval
  // sigue disparando (aunque limitado) en segundo plano, y como todo se
  // deriva de timestamps reales, cada tick muestra el valor correcto sin
  // importar cuánto tiempo pasó desde el anterior.
  document.addEventListener("visibilitychange", () => {
    if(document.visibilityState === "visible" && intervalId) render();
  });

  return {
    show(){
      renderDayTabs();
      if(!intervalId){
        render();
        intervalId = setInterval(render, 200);
      }
    },
    hide(){
      if(intervalId){ clearInterval(intervalId); intervalId = null; }
      clearBeeps();
    }
  };
}
