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

  // Mensaje corto que se superpone al sublabel normal por unos segundos
  // (ej. avisos de los pulsadores) sin que el próximo tick de render() lo
  // pise de inmediato.
  let flashMsg = null;
  let flashUntil = 0;
  function flashSublabel(msg, ms){
    flashMsg = msg;
    flashUntil = Date.now() + (ms || 3000);
  }

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

  // El AudioContext arranca "suspended" en la mayoria de los navegadores si
  // no se crea/reanuda dentro de un gesto real del usuario (autoplay policy).
  // Como los beeps se disparan desde setTimeout (sin gesto), si no lo
  // destrabamos aca, quedan mudos hasta que algo mas lo reanude por
  // casualidad — eso es lo que se percibia como "la chicharra empieza tarde".
  let audioCtx = null;
  function unlockAudio(){
    if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if(audioCtx.state === "suspended") audioCtx.resume().catch(()=>{});
  }
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
    digitsEl.style.fontSize = "";
    tocarBtn.className = "tocar";
    tocarBtn.textContent = "Tocar";
    sublabelEl.textContent = "";
  }

  // Un clamp() de CSS no puede adaptarse al largo variable del texto
  // ("0:45" vs "59:59"), así que para el PC en marcha medimos y calculamos
  // el font-size que realmente llena el ancho disponible sin desbordar.
  function fitDigitsToStage(){
    const stageEl = digitsEl.closest(".stage");
    if(!stageEl) return;
    const maxWidth = stageEl.clientWidth - 40;
    const maxHeight = stageEl.clientHeight * 0.55;
    digitsEl.style.fontSize = "100px";
    const naturalWidth = digitsEl.scrollWidth || 1;
    let size = Math.floor((maxWidth / naturalWidth) * 100);
    size = Math.min(size, Math.floor(maxHeight));
    size = Math.max(90, Math.min(size, 320));
    digitsEl.style.fontSize = size + "px";
  }

  function render(){
    renderInner();
    if(flashMsg && Date.now() < flashUntil) sublabelEl.textContent = flashMsg;
  }

  function renderInner(){
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
    digitsEl.className = "digits running" + (status.remainingMs <= umbralMs ? " critical" : "") + (status.remainingMs < 0 ? " neg" : "");
    fitDigitsToStage();
    if(status.overdue){
      sublabelEl.textContent = "Tiempo excedido — tocá para finalizar";
      bannerEl.textContent = "Debe tocar";
      bannerEl.className = "banner show debe";
    }
    scheduleBeepsForPC(status);
  }

  // Accion compartida por el boton en pantalla y por los pulsadores fisicos:
  // dado un instante ya resuelto, largar o finalizar el PC actual.
  function doTocar(now){
    unlockAudio();
    if(!currentStatus || currentStatus.kind !== "PC") return;
    const day = activeDay();
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
  }

  tocarBtn.onclick = () => doTocar(nowOficial(state));

  // --- Pulsadores fisicos (Bluetooth emparejados como teclado del SO) ---
  // Cada uno manda su propia tecla (configurada en Ajustes). Con "Modo dual"
  // apagado cualquiera de los dos dispara el toque de inmediato (redundante).
  // Con "Modo dual" prendido se espera a que ambos toquen el mismo evento y
  // se promedian los instantes, descartando el mas alejado si la diferencia
  // supera la tolerancia configurada.
  let pendingPulsador = null; // {role, key, instant}
  let pendingTimeoutId = null;

  function clearPendingPulsador(){
    if(pendingTimeoutId){ clearTimeout(pendingTimeoutId); pendingTimeoutId = null; }
    pendingPulsador = null;
  }

  function rolePorTecla(code){
    if(code && code === state.ajustes.pulsadorCopilotoKey) return "copiloto";
    if(code && code === state.ajustes.pulsadorPilotoKey) return "piloto";
    return null;
  }

  function onPulsadorKey(e){
    const role = rolePorTecla(e.code);
    if(!role) return;
    e.preventDefault();
    if(!currentStatus || currentStatus.kind !== "PC") return;
    const pcKey = currentStatus.key;
    const now = nowOficial(state);

    if(!state.ajustes.dualPulsadores){
      doTocar(now);
      return;
    }

    if(pendingPulsador && pendingPulsador.key === pcKey && pendingPulsador.role !== role){
      const diff = Math.abs(now - pendingPulsador.instant);
      const tolerancia = Math.max(0, state.ajustes.toleranciaMs || 0);
      const finalNow = diff <= tolerancia ? Math.round((now + pendingPulsador.instant) / 2) : pendingPulsador.instant;
      clearPendingPulsador();
      doTocar(finalNow);
      if(diff > tolerancia) flashSublabel("Discrepancia entre pulsadores (" + Math.round(diff) + "ms) — se usó el primer toque");
      return;
    }

    clearPendingPulsador();
    pendingPulsador = { role, key: pcKey, instant: now };
    const esperaMs = Math.max(1500, (state.ajustes.toleranciaMs || 0) * 3);
    pendingTimeoutId = setTimeout(() => {
      if(pendingPulsador && pendingPulsador.key === pcKey){
        const solo = pendingPulsador;
        clearPendingPulsador();
        doTocar(solo.instant);
        flashSublabel("Solo se registró el pulsador de " + solo.role);
      }
    }, esperaMs);
  }

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

  // Destraba el audio en el primer toque a la app, sea donde sea (no solo
  // en "Tocar"), para que ya este listo apenas arranque el primer PC.
  document.addEventListener("pointerdown", unlockAudio, {once:true});

  return {
    show(){
      renderDayTabs();
      document.addEventListener("keydown", onPulsadorKey);
      if(!intervalId){
        render();
        intervalId = setInterval(render, 200);
      }
    },
    hide(){
      document.removeEventListener("keydown", onPulsadorKey);
      clearPendingPulsador();
      if(intervalId){ clearInterval(intervalId); intervalId = null; }
      clearBeeps();
    }
  };
}
