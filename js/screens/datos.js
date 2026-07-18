import { store } from "../store.js";
import { openTimePad, timeField, fmtBuffer } from "../timepad.js";
import { instantFromHora, nowOficial } from "../engine.js";

export function initDatos(){
  const state = store.state;
  let openRowId = null;

  const dayTabsEl = document.getElementById("dayTabs");
  const listEl = document.getElementById("list");
  const horariosListEl = document.getElementById("horariosList");

  function activeDay(){ return state.ui.activeDayDatos; }
  function days(){ return state.days[activeDay()] || []; }
  function horarios(){ return state.dayHorarios[activeDay()] || []; }

  function renderTabs(){
    dayTabsEl.innerHTML = "";
    Object.keys(state.days).forEach(day => {
      const wrap = document.createElement("span");
      wrap.className = "daytabWrap";
      const b = document.createElement("button");
      b.className = "daytab" + (day === activeDay() ? " active" : "");
      b.textContent = day;
      b.onclick = () => { state.ui.activeDayDatos = day; openRowId = null; renderAll(); };
      wrap.appendChild(b);
      if(Object.keys(state.days).length > 1){
        const del = document.createElement("button");
        del.className = "daytabDel";
        del.textContent = "✕";
        del.title = "Eliminar " + day;
        del.onclick = (e) => {
          e.stopPropagation();
          if(!confirm("¿Eliminar \"" + day + "\" y todo lo cargado en esa etapa? Esta acción no se puede deshacer.")) return;
          delete state.days[day];
          delete state.dayHorarios[day];
          delete state.diasMeta[day];
          if(activeDay() === day){
            state.ui.activeDayDatos = Object.keys(state.days)[0];
          }
          openRowId = null;
          renderAll();
        };
        wrap.appendChild(del);
      }
      dayTabsEl.appendChild(wrap);
    });
    const addDay = document.createElement("button");
    addDay.className = "daytab add";
    addDay.textContent = "+ Etapa";
    addDay.onclick = () => {
      const n = Object.keys(state.days).length + 1;
      const name = "Etapa " + n;
      store.ensureDay(name);
      state.ui.activeDayDatos = name;
      renderAll();
    };
    dayTabsEl.appendChild(addDay);
  }

  function renderHorarios(){
    horariosListEl.innerHTML = "";
    horarios().forEach(h => {
      const row = document.createElement("div");
      row.className = "horarioItem";
      const nombreInp = document.createElement("input");
      nombreInp.className = "nombre"; nombreInp.type = "text"; nombreInp.value = h.nombre;
      nombreInp.oninput = () => { h.nombre = nombreInp.value; store.save(); };
      nombreInp.onblur = () => renderList();

      const pill = document.createElement("div");
      pill.className = "timepill";
      pill.style.flex = "1";
      pill.textContent = fmtBuffer(h.hora);
      pill.onclick = () => {
        openTimePad(h.nombre, h.hora, (newVal) => { h.hora = newVal; pill.textContent = fmtBuffer(newVal); renderList(); });
      };

      const del = document.createElement("button");
      del.textContent = "✕";
      del.onclick = () => {
        state.dayHorarios[activeDay()] = horarios().filter(x => x.id !== h.id);
        renderHorarios(); renderList();
      };
      row.appendChild(nombreInp); row.appendChild(pill); row.appendChild(del);
      horariosListEl.appendChild(row);
    });
    store.notify();
  }

  function horarioNombre(refId){
    const h = horarios().find(x => x.id === refId);
    return h ? h.nombre : "(sin horario)";
  }
  function refOptions(){
    return horarios().map(h => [String(h.id), h.nombre]);
  }
  function pcSetLabel(item){
    const last = item.primerNumero + item.cantidad - 1;
    const rango = item.cantidad > 1 ? ("PC " + item.primerNumero + "–" + last) : ("PC " + item.primerNumero);
    return rango + " · " + item.cantidad + " prueba" + (item.cantidad > 1 ? "s" : "");
  }
  function chNombreById(id){
    const item = days().find(x => x.itemType === "CH" && x.id === id);
    return item ? item.nombre : "CH";
  }
  function chItemById(id){
    return days().find(x => x.itemType === "CH" && x.id === id) || null;
  }
  function chOptions(){
    return days().filter(x => x.itemType === "CH").map(x => [String(x.id), x.nombre]);
  }
  function origenPCLabel(item){
    if(item.origen === "libre") return "Largada libre";
    if(item.origen === "CH") return "Enlazado a " + chNombreById(item.chId);
    if(item.origen === "ref") return horarioNombre(item.refId) + " +" + fmtBuffer(item.offset || "000000");
    return "";
  }

  // ---------- Orden cronologico ----------
  // Devuelve el instante absoluto (ms) del item, o null si no tiene uno
  // definido (largada libre) — esos quedan donde el usuario los ubique a mano.
  function scheduledInstantFor(item){
    if(item.itemType === "CH" || item.itemType === "CS"){
      const h = horarios().find(x => x.id === item.refId);
      return h ? instantFromHora(h.hora, item.offset) : null;
    }
    if(item.itemType === "PCSET"){
      if(item.origen === "ref"){
        const h = horarios().find(x => x.id === item.refId);
        return h ? instantFromHora(h.hora, item.offset) : null;
      }
      if(item.origen === "CH"){
        const ch = chItemById(item.chId);
        if(!ch) return null;
        const h = horarios().find(x => x.id === ch.refId);
        return h ? instantFromHora(h.hora, ch.offset) : null;
      }
    }
    return null; // libre
  }

  function sortChronologically(items){
    // Estable: los items con horario definido se ordenan entre si; los que
    // no tienen horario (libre) no se comparan (quedan donde estaban, ubicados
    // a mano por el usuario mediante el arrastre).
    items.sort((a, b) => {
      const ta = scheduledInstantFor(a);
      const tb = scheduledInstantFor(b);
      if(ta == null || tb == null) return 0;
      return ta - tb;
    });
  }

  // ---------- Estado "ya sucedido" ----------
  function isChCsDone(item){
    const t = scheduledInstantFor(item);
    return t != null && nowOficial(state) >= t;
  }
  function pcResultsForDay(){
    return state.carrera.pcResults[activeDay()] || [];
  }
  function pcDoneIndexes(setId){
    const done = new Set();
    pcResultsForDay().forEach(r => {
      if(r.key && r.key.startsWith(setId + ":")) done.add(parseInt(r.key.split(":")[1], 10));
    });
    return done;
  }

  // ---------- Drag and drop tactil (funciona con mouse y con touch) ----------
  let dragState = null; // {idx, row, startY, offsetY}

  function attachDragHandle(handle, row, idx, items){
    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      const rect = row.getBoundingClientRect();
      dragState = { idx, row, startY: e.clientY, rectTop: rect.top, rectHeight: rect.height };
      row.classList.add("dragging");
      row.style.zIndex = "10";
    });
    handle.addEventListener("pointermove", (e) => {
      if(!dragState || dragState.row !== row) return;
      const dy = e.clientY - dragState.startY;
      row.style.transform = "translateY(" + dy + "px)";
      row.style.position = "relative";

      // Detecta sobre que otro renglon esta el puntero, para mostrar el indicador
      const siblings = Array.from(listEl.children);
      siblings.forEach(sib => sib.classList.remove("dragover"));
      const target = siblings.find(sib => {
        if(sib === row) return false;
        const r = sib.getBoundingClientRect();
        return e.clientY >= r.top && e.clientY <= r.bottom;
      });
      if(target) target.classList.add("dragover");
    });
    const finishDrag = (e) => {
      if(!dragState || dragState.row !== row) return;
      row.classList.remove("dragging");
      row.style.transform = "";
      row.style.position = "";
      row.style.zIndex = "";
      const siblings = Array.from(listEl.children);
      siblings.forEach(sib => sib.classList.remove("dragover"));
      const targetIdx = siblings.findIndex(sib => {
        if(sib === row) return false;
        const r = sib.getBoundingClientRect();
        return e.clientY >= r.top && e.clientY <= r.bottom;
      });
      dragState = null;
      if(targetIdx === -1 || targetIdx === idx) return;
      const moved = items.splice(idx, 1)[0];
      items.splice(targetIdx, 0, moved);
      renderList();
    };
    handle.addEventListener("pointerup", finishDrag);
    handle.addEventListener("pointercancel", finishDrag);
  }

  function renderList(){
    const items = days();
    sortChronologically(items);
    listEl.innerHTML = "";
    items.forEach((c, idx) => {
      const row = document.createElement("div");
      row.className = "row";
      row.dataset.idx = idx;

      const top = document.createElement("div");
      top.className = "row-top";

      const handle = document.createElement("button");
      handle.className = "handle";
      handle.textContent = "⠿";
      attachDragHandle(handle, row, idx, items);

      const badge = document.createElement("span");
      const name = document.createElement("span");
      name.className = "row-name";
      const time = document.createElement("span");
      time.className = "row-time";

      let done = false;
      let doneLabel = "";

      if(c.itemType === "CH"){
        badge.className = "badge CH"; badge.textContent = "CH";
        name.textContent = c.nombre;
        time.textContent = horarioNombre(c.refId) + " +" + fmtBuffer(c.offset || "000000");
        done = isChCsDone(c);
      } else if(c.itemType === "CS"){
        badge.className = "badge CS"; badge.textContent = "CS";
        name.textContent = c.nombre;
        time.textContent = horarioNombre(c.refId) + " +" + fmtBuffer(c.offset || "000000");
        done = isChCsDone(c);
      } else {
        badge.className = "badge PCSET"; badge.textContent = "PC";
        name.textContent = pcSetLabel(c);
        time.textContent = origenPCLabel(c);
        const doneSet = pcDoneIndexes(c.id);
        if(doneSet.size > 0){
          doneLabel = doneSet.size + "/" + c.cantidad + " hechos";
          if(doneSet.size >= c.cantidad) done = true;
        }
      }

      if(done) row.classList.add("done");

      const toggleOpen = () => { openRowId = (openRowId === c.id) ? null : c.id; renderList(); };
      name.onclick = toggleOpen;
      time.onclick = toggleOpen;

      top.appendChild(handle);
      top.appendChild(badge);
      top.appendChild(name);
      if(done){
        const check = document.createElement("span");
        check.className = "donecheck";
        check.textContent = "✓";
        top.appendChild(check);
      }
      top.appendChild(time);
      row.appendChild(top);

      if(doneLabel){
        const pill = document.createElement("span");
        pill.className = "chainpill done";
        pill.textContent = doneLabel;
        row.appendChild(pill);
      }

      if(c.itemType === "PCSET" && c.origen === "CH"){
        const pill = document.createElement("span");
        pill.className = "chainpill";
        pill.textContent = "🔗 arranca con " + chNombreById(c.chId);
        row.appendChild(pill);
      }

      const form = document.createElement("div");
      form.className = "editform" + (openRowId === c.id ? " open" : "");
      buildForm(form, c, items, idx);
      row.appendChild(form);

      listEl.appendChild(row);
    });
    store.notify();
  }

  // field(): oninput solo actualiza estado y guarda (sin re-renderizar la
  // lista), asi el input nunca pierde el foco mientras se tipea. El refresco
  // visual completo (que actualiza el nombre/hora mostrados arriba) ocurre
  // recien al salir del campo (onblur).
  function field(labelText, type, value, onChange, disabled){
    const wrap = document.createElement("div");
    wrap.className = "field";
    const l = document.createElement("label"); l.textContent = labelText;
    const i = document.createElement("input");
    i.type = type; i.value = value || ""; if(disabled) i.disabled = true;
    i.oninput = () => { onChange(i.value); store.save(); };
    i.onfocus = () => i.select();
    i.onblur = () => renderList();
    wrap.appendChild(l); wrap.appendChild(i);
    return wrap;
  }
  function selectField(labelText, options, value, onChange, disabled){
    const wrap = document.createElement("div");
    wrap.className = "field";
    const l = document.createElement("label"); l.textContent = labelText;
    const s = document.createElement("select");
    if(disabled) s.disabled = true;
    options.forEach(([val, txt]) => {
      const opt = document.createElement("option");
      opt.value = val; opt.textContent = txt;
      if(val === value) opt.selected = true;
      s.appendChild(opt);
    });
    s.onchange = () => onChange(s.value);
    wrap.appendChild(l); wrap.appendChild(s);
    return wrap;
  }
  function deleteBtn(items, idx){
    const del = document.createElement("button");
    del.className = "deleterow";
    del.textContent = "Eliminar";
    del.onclick = () => { items.splice(idx, 1); openRowId = null; renderList(); };
    return del;
  }

  function buildForm(form, c, items, idx){
    if(c.itemType === "CH" || c.itemType === "CS"){
      const locked = isChCsDone(c);
      if(locked){
        const aviso = document.createElement("div");
        aviso.className = "lockedNote";
        aviso.textContent = "Este control ya pasó — no se puede editar.";
        form.appendChild(aviso);
      }
      form.appendChild(field("Nombre", "text", c.nombre, v => { c.nombre = v; }, locked));
      const opts = refOptions();
      form.appendChild(selectField("Horario de referencia", opts, String(c.refId), v => { c.refId = parseInt(v, 10); renderList(); }, locked));
      form.appendChild(timeField("Offset (hh:mm:ss)", c.offset, v => { c.offset = v; renderList(); }, locked));
      if(!locked) form.appendChild(deleteBtn(items, idx));
      return;
    }

    const doneSet = pcDoneIndexes(c.id);
    const structureLocked = doneSet.size > 0; // ya arranco/corrio algun PC del set

    if(structureLocked){
      const aviso = document.createElement("div");
      aviso.className = "lockedNote";
      aviso.textContent = "Ya se registraron resultados de este set — el número, la cantidad y el origen quedan bloqueados para no invalidar lo ya corrido.";
      form.appendChild(aviso);
    }

    const row2 = document.createElement("div");
    row2.className = "row2";
    row2.appendChild(field("Número del primero", "text", String(c.primerNumero), v => {
      c.primerNumero = parseInt(v, 10) || 1;
    }, structureLocked));
    row2.appendChild(field("Cantidad de PC", "text", String(c.cantidad), v => {
      const n = Math.max(1, parseInt(v, 10) || 1);
      const old = c.tiempos;
      c.tiempos = Array.from({length: n}, (_, i) => old[i] || "000130");
      c.cantidad = n;
    }, structureLocked));
    form.appendChild(row2);

    const origenOpts = [["libre", "Largada libre"], ["CH", "Enlazado a un CH"]].concat(
      refOptions().map(([val, txt]) => ["ref:" + val, txt])
    );
    const currentOrigenVal = c.origen === "ref" ? ("ref:" + c.refId) : c.origen;
    form.appendChild(selectField("Origen del primer PC", origenOpts, currentOrigenVal, v => {
      if(v.startsWith("ref:")){ c.origen = "ref"; c.refId = parseInt(v.slice(4), 10); }
      else {
        c.origen = v;
        if(v === "CH" && !c.chId){
          const opts = chOptions();
          if(opts.length) c.chId = parseInt(opts[0][0], 10);
        }
      }
      renderList();
    }, structureLocked));

    if(c.origen === "CH"){
      const opciones = chOptions();
      if(opciones.length === 0){
        const aviso = document.createElement("div");
        aviso.style.cssText = "font-size:12px;color:var(--muted);padding:4px 0;";
        aviso.textContent = "Todavía no hay ningún CH cargado en esta etapa.";
        form.appendChild(aviso);
      } else {
        form.appendChild(selectField("¿Cuál CH?", opciones, String(c.chId), v => { c.chId = parseInt(v, 10); renderList(); }, structureLocked));
      }
    }
    if(c.origen === "ref"){
      form.appendChild(timeField("Offset desde ese horario", c.offset, v => { c.offset = v; }, structureLocked));
    }

    const grid = document.createElement("div");
    grid.className = "pcgrid";
    for(let i = 0; i < c.cantidad; i++){
      const wrap = document.createElement("div");
      wrap.className = "pcitem";
      const pcDone = doneSet.has(i);
      const lbl = document.createElement("span");
      lbl.className = "pclabel";
      lbl.textContent = "PC " + (c.primerNumero + i) + (pcDone ? " ✓" : "");
      const pill = document.createElement("div");
      pill.className = "timepill" + (pcDone ? " locked" : "");
      pill.textContent = fmtBuffer(c.tiempos[i] || "000000");
      if(!pcDone){
        pill.onclick = ((index) => () => {
          openTimePad("PC " + (c.primerNumero + index), c.tiempos[index], (newVal) => {
            c.tiempos[index] = newVal;
            pill.textContent = fmtBuffer(newVal);
            store.notify();
          });
        })(i);
      }
      wrap.appendChild(lbl); wrap.appendChild(pill);
      grid.appendChild(wrap);
    }
    form.appendChild(grid);
    if(!structureLocked) form.appendChild(deleteBtn(items, idx));
  }

  document.getElementById("addHorarioBtn").onclick = () => {
    store.ensureDay(activeDay());
    state.dayHorarios[activeDay()].push({id: state.nextHorarioId++, nombre: "Nuevo horario", hora: "000000"});
    renderHorarios();
  };

  document.getElementById("addCH").onclick = () => {
    const items = days();
    const firstRef = horarios()[0];
    const n = {id: state.nextId++, itemType: "CH", nombre: "Nuevo CH", refId: firstRef ? firstRef.id : null, offset: "000000"};
    items.push(n); openRowId = n.id; renderList();
  };
  document.getElementById("addCS").onclick = () => {
    const items = days();
    const firstRef = horarios()[0];
    const n = {id: state.nextId++, itemType: "CS", nombre: "Nuevo CS", refId: firstRef ? firstRef.id : null, offset: "000000"};
    items.push(n); openRowId = n.id; renderList();
  };
  document.getElementById("addPCSET").onclick = () => {
    const items = days();
    const n = {id: state.nextId++, itemType: "PCSET", primerNumero: 1, cantidad: 1, origen: "libre", refId: null, chId: null, tiempos: ["000130"]};
    items.push(n); openRowId = n.id; renderList();
  };

  function renderAll(){ renderTabs(); renderHorarios(); renderList(); store.notify(); }

  let tickId = null;
  return {
    show(){
      renderAll();
      // refresca cada 15s para que "ya pasó" se actualice solo mientras la
      // pantalla esta abierta, sin que el usuario tenga que hacer nada
      if(!tickId) tickId = setInterval(renderList, 15000);
    },
    hide(){
      if(tickId){ clearInterval(tickId); tickId = null; }
    }
  };
}
