// Teclado numérico propio para ingresar hh:mm:ss, compartido por Datos y Ajustes.
// No usa el teclado del sistema — coherente con el diseño original de Datos.

export function fmtBuffer(buf){
  const b = (buf || "000000").replace(/:/g, "").padStart(6, "0").slice(-6);
  return b.slice(0,2) + ":" + b.slice(2,4) + ":" + b.slice(4,6);
}

let overlay, header, display, grid, doneBtn;
let buffer = "000000";
let onConfirm = null;

function build(){
  if(overlay) return;
  overlay = document.createElement("div");
  overlay.className = "tp-overlay";

  const sheet = document.createElement("div");
  sheet.className = "tp-sheet";

  header = document.createElement("div");
  header.className = "tp-header";
  header.textContent = "Hora";

  display = document.createElement("div");
  display.className = "tp-display";
  display.textContent = "00:00:00";

  grid = document.createElement("div");
  grid.className = "tp-grid";
  ["1","2","3","4","5","6","7","8","9","⌫","0","✕"].forEach(k => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = k;
    b.onclick = () => {
      if(k === "⌫"){ buffer = ("0" + buffer).slice(0, 6); }
      else if(k === "✕"){ close(); return; }
      else { buffer = (buffer + k).slice(-6); }
      display.textContent = fmtBuffer(buffer);
    };
    grid.appendChild(b);
  });

  doneBtn = document.createElement("button");
  doneBtn.type = "button";
  doneBtn.className = "tp-done";
  doneBtn.textContent = "Listo";
  doneBtn.onclick = () => {
    if(onConfirm) onConfirm(buffer);
    close();
  };

  sheet.appendChild(header);
  sheet.appendChild(display);
  sheet.appendChild(grid);
  sheet.appendChild(doneBtn);
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
}

function close(){
  overlay.classList.remove("show");
}

export function openTimePad(label, currentValue, confirmCb){
  build();
  header.textContent = label;
  buffer = (currentValue || "000000").replace(/:/g, "").padStart(6, "0").slice(-6);
  display.textContent = fmtBuffer(buffer);
  onConfirm = confirmCb;
  overlay.classList.add("show");
}

export function timeField(labelText, value, onChange){
  const wrap = document.createElement("div");
  wrap.className = "field";
  const l = document.createElement("label");
  l.textContent = labelText;
  const pill = document.createElement("div");
  pill.className = "timepill";
  pill.textContent = fmtBuffer(value);
  pill.onclick = () => {
    openTimePad(labelText, value, (newVal) => {
      onChange(newVal);
      pill.textContent = fmtBuffer(newVal);
    });
  };
  wrap.appendChild(l);
  wrap.appendChild(pill);
  return wrap;
}
