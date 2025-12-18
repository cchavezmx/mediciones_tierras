import React, { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import Plot from "react-plotly.js";

function normalizeKey(k) {
  // Limpia BOM, espacios duplicados y convierte a formato predecible
  return String(k || "").replace(/^\uFEFF/, "").trim().replace(/\s+/g, "_");
}

function toNumber(v) {
  if (v === null || v === undefined) return null;
  const raw = String(v).trim();
  // Si el valor viene con decimal usando coma y sin punto, conviértelo
  const s = raw.includes(",") && !raw.includes(".") ? raw.replace(/,/g, ".") : raw;
  const cleaned = s.replace(/\s+/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseTime(v) {
  const s = String(v || "").trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yyyy = Number(m[3]);
    const HH = Number(m[4]);
    const MM = Number(m[5]);
    return new Date(yyyy, mm - 1, dd, HH, MM);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function pickColumn(cols, candidates) {
  const set = new Set(cols);
  for (const c of candidates) {
    if (set.has(c)) return c;
  }
  return null;
}

export default function App() {
  const [rows, setRows] = useState([]);
  const [metric, setMetric] = useState("all"); // all | urms | irms | ipk | potencia
  const [phase, setPhase] = useState("ALL"); // L1 | L2 | L3 | ALL
  const plotRef = useRef(null);

  const detected = useMemo(() => {
    if (!rows.length) return null;
    const cols = Object.keys(rows[0] || {});

    const timeCol = pickColumn(cols, ["Time", "time", "Fecha", "FECHA", "Datetime", "DateTime"]);

    // EXACTOS a tus headers normalizados:
    const urms = {
      L1: pickColumn(cols, ["Urms_L1_MAX"]),
      L2: pickColumn(cols, ["Urms_L2_MAX"]),
      L3: pickColumn(cols, ["Urms_L3_MAX"]),
    };

    const irms = {
      L1: pickColumn(cols, ["Irms_L1_MAX"]),
      L2: pickColumn(cols, ["Irms_L2_MAX"]),
      L3: pickColumn(cols, ["Irms_L3_MAX"]),
    };

    const ipk = {
      L1: pickColumn(cols, ["Ipk_L1_MAX"]),
      L2: pickColumn(cols, ["Ipk_L2_MAX"]),
      L3: pickColumn(cols, ["Ipk_L3_MAX"]),
    };

    const potencia = {
      L1: pickColumn(cols, ["P_L1_MAX"]),
      L2: pickColumn(cols, ["P_L2_MAX"]),
      L3: pickColumn(cols, ["P_L3_MAX"]),
      ALL: pickColumn(cols, ["P_All_MAX"]),
    };

    return { cols, timeCol, urms, irms, ipk, potencia };
  }, [rows]);

  const chart = useMemo(() => {
    if (!rows.length || !detected?.timeCol) return { traces: [], title: "Sin datos" };

    const x = rows.map((r) => parseTime(r[detected.timeCol]));

    const traces = [];
    const addTrace = (name, yKey) => {
      if (!yKey) return;
      const y = rows.map((r) => toNumber(r[yKey]));
      const hasData = y.some((v) => v !== null);
      if (!hasData) return;
      traces.push({ x, y, type: "scatter", mode: "lines", name });
    };

    if (metric === "all") {
      const candidates = (detected.cols || []).filter((c) => c !== detected.timeCol);
      candidates.forEach((c) => addTrace(c, c));
      return { traces, title: "Todas las columnas", yTitle: "Valor" };
    }

    if (metric === "urms") {
      const m = detected.urms;
      if (phase === "ALL") {
        addTrace("Urms L1", m.L1);
        addTrace("Urms L2", m.L2);
        addTrace("Urms L3", m.L3);
      } else {
        addTrace(`Urms ${phase}`, m[phase]);
      }
      return { traces, title: `Voltaje (Urms) - ${phase === "ALL" ? "Todas" : phase}`, yTitle: "V" };
    }

    if (metric === "irms") {
      const m = detected.irms;
      if (phase === "ALL") {
        addTrace("Irms L1", m.L1);
        addTrace("Irms L2", m.L2);
        addTrace("Irms L3", m.L3);
      } else {
        addTrace(`Irms ${phase}`, m[phase]);
      }
      return { traces, title: `Corriente (Irms) - ${phase === "ALL" ? "Todas" : phase}`, yTitle: "A" };
    }

    if (metric === "ipk") {
      const m = detected.ipk;
      if (phase === "ALL") {
        addTrace("Ipk L1", m.L1);
        addTrace("Ipk L2", m.L2);
        addTrace("Ipk L3", m.L3);
      } else {
        addTrace(`Ipk ${phase}`, m[phase]);
      }
      return { traces, title: `Corriente pico (Ipk) - ${phase === "ALL" ? "Todas" : phase}`, yTitle: "A" };
    }

    // potencia
    const m = detected.potencia;
    if (phase === "ALL") {
      addTrace("P L1", m.L1);
      addTrace("P L2", m.L2);
      addTrace("P L3", m.L3);
      addTrace("P Total (All)", m.ALL);
      return { traces, title: `Potencia - Todas + Total`, yTitle: "W" };
    } else {
      addTrace(`P ${phase}`, m[phase]);
      return { traces, title: `Potencia - ${phase}`, yTitle: "W" };
    }
  }, [rows, metric, phase, detected]);

  const onUpload = (file) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      delimitersToGuess: [",", ";", "\t", "|"],
      transformHeader: (h) => normalizeKey(h),
      transform: (value) => (typeof value === "string" ? value.trim() : value),
      complete: (res) => {
        setRows(res.data || []);
      },
      error: (err) => console.error(err),
    });
  };

  const exportPNG = async () => {
    try {
      const el = plotRef.current?.el;
      if (!el) return;
      const Plotly = (await import("plotly.js-dist-min")).default;
      const url = await Plotly.toImage(el, { format: "png", height: 600, width: 1200 });
      const a = document.createElement("a");
      a.href = url;
      a.download = `${metric}_${phase}.png`;
      a.click();
    } catch (e) {
      console.error(e);
      alert("No pude exportar la imagen. Revisa consola.");
    }
  };

  const missing = useMemo(() => {
    if (!rows.length) return null;
    if (!detected?.timeCol) return "No encuentro la columna Time.";
    // valida que existan las columnas de la métrica elegida
    const check = (obj) => obj && (obj.L1 || obj.L2 || obj.L3 || obj.ALL);
    if (metric === "all") {
      const cols = (detected?.cols || []).filter((c) => c !== detected.timeCol);
      const hasNumeric = cols.some((c) => rows.some((r) => toNumber(r[c]) !== null));
      if (!cols.length || !hasNumeric) return "No encuentro columnas numéricas para graficar.";
      return null;
    }
    if (metric === "urms" && !check(detected.urms)) return "No encuentro Urms_L1_MAX / Urms_L2_MAX / Urms_L3_MAX.";
    if (metric === "irms" && !check(detected.irms)) return "No encuentro Irms_L1_MAX / Irms_L2_MAX / Irms_L3_MAX.";
    if (metric === "ipk" && !check(detected.ipk)) return "No encuentro Ipk_L1_MAX / Ipk_L2_MAX / Ipk_L3_MAX.";
    if (metric === "potencia" && !check(detected.potencia)) return "No encuentro P_L1_MAX / P_L2_MAX / P_L3_MAX.";
    return null;
  }, [rows, detected, metric]);

  const tableHeaders = useMemo(() => (detected?.cols || []), [detected]);
  const tableRows = useMemo(() => rows.slice(0, 50), [rows]); // muestra 50 filas para no matar el navegador

  return (
    <div style={{ padding: 24, maxWidth: 1300, margin: "0 auto", fontFamily: "system-ui" }}>
      <h1 style={{ margin: 0 }}>Mediciones desde CSV</h1>
      <p style={{ opacity: 0.75 }}>
        Sube un CSV y genera gráficas de Urms/Irms/Ipk/Potencia por fase. Eje X = fecha/hora (Time).
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", margin: "16px 0" }}>
        <input
          type="file"
          accept=".csv"
          onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
        />

        <select value={metric} onChange={(e) => setMetric(e.target.value)}>
          <option value="all">Todas las columnas (auto)</option>
          <option value="urms">Voltaje (Urms)</option>
          <option value="irms">Corriente (Irms)</option>
          <option value="ipk">Corriente pico (Ipk)</option>
          <option value="potencia">Potencia (P)</option>
        </select>

        {metric !== "all" && (
          <select value={phase} onChange={(e) => setPhase(e.target.value)}>
            <option value="ALL">Todas</option>
            <option value="L1">L1</option>
            <option value="L2">L2</option>
            <option value="L3">L3</option>
          </select>
        )}

        <button onClick={exportPNG} disabled={!rows.length || !!missing}>
          Exportar PNG
        </button>
      </div>

      {!rows.length ? (
        <div style={{ padding: 20, border: "1px dashed #aaa", borderRadius: 12 }}>
          Sube un CSV para ver las gráficas.
        </div>
      ) : missing ? (
        <div style={{ padding: 20, border: "1px solid #f2c", borderRadius: 12 }}>
          {missing}
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
            Columnas detectadas: <code>{detected?.cols?.join(", ")}</code>
          </div>
        </div>
      ) : (
        <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, width: "fit-content" }}>
          <Plot
            ref={plotRef}
            data={chart.traces}
            layout={{
              title: chart.title,
              xaxis: { title: "Fecha/Hora" },
              yaxis: { title: chart.yTitle },
              legend: { orientation: "h" },
              margin: { l: 60, r: 30, t: 60, b: 60 },
            }}
            config={{ responsive: true }}
            style={{ width: "100%", height: 520 }}
          />
        </div>
      )}

      {/* TABLA con TODAS las columnas */}
      {/* {rows.length > 0 && ( */}
      {/*   <div style={{ marginTop: 18 }}> */}
      {/*     <h3 style={{ marginBottom: 8 }}>Datos (primeras 50 filas, todas las columnas)</h3> */}
      {/*     <div style={{ overflowX: "auto", border: "1px solid #eee", borderRadius: 12 }}> */}
      {/*       <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1100 }}> */}
      {/*         <thead> */}
      {/*           <tr> */}
      {/*             {tableHeaders.map((h) => ( */}
      {/*               <th */}
      {/*                 key={h} */}
      {/*                 style={{ */}
      {/*                   position: "sticky", */}
      {/*                   top: 0, */}
      {/*                   background: "#fff", */}
      {/*                   borderBottom: "1px solid #eee", */}
      {/*                   padding: "8px 10px", */}
      {/*                   textAlign: "left", */}
      {/*                   whiteSpace: "nowrap", */}
      {/*                   fontSize: 12, */}
      {/*                 }} */}
      {/*               > */}
      {/*                 {h} */}
      {/*               </th> */}
      {/*             ))} */}
      {/*           </tr> */}
      {/*         </thead> */}
      {/*         <tbody> */}
      {/*           {tableRows.map((r, idx) => ( */}
      {/*             <tr key={idx}> */}
      {/*               {tableHeaders.map((h) => ( */}
      {/*                 <td */}
      {/*                   key={h} */}
      {/*                   style={{ */}
      {/*                     borderBottom: "1px solid #f5f5f5", */}
      {/*                     padding: "6px 10px", */}
      {/*                     whiteSpace: "nowrap", */}
      {/*                     fontSize: 12, */}
      {/*                   }} */}
      {/*                 > */}
      {/*                   {String(r[h] ?? "")} */}
      {/*                 </td> */}
      {/*               ))} */}
      {/*             </tr> */}
      {/*           ))} */}
      {/*         </tbody> */}
      {/*       </table> */}
      {/*     </div> */}
      {/*     <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}> */}
      {/*       Tip: si quieres ver más de 50 filas, te lo ajusto (pero puede ponerse pesado si el CSV es grande). */}
      {/*     </div> */}
      {/*   </div> */}
      {/* )} */}
    </div>
  );
}
