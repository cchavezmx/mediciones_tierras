import React, { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import Plot from "react-plotly.js";

function normalizeKey(k) {
  return String(k || "")
    .trim()
    .replace(/\s+/g, "_");
}

function toNumber(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/,/g, "").replace(/\s+/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseTime(v) {
  // Espera "dd/mm/yyyy HH:MM" (tu caso)
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
  // fallback por si viene otro formato
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Detecta columnas típicas aunque vengan con espacios / underscores
function pickColumn(cols, candidates) {
  const set = new Set(cols);
  for (const c of candidates) {
    if (set.has(c)) return c;
  }
  return null;
}

export default function App() {
  const [rows, setRows] = useState([]);
  const [metric, setMetric] = useState("voltaje"); // voltaje | corriente | potencia
  const [phase, setPhase] = useState("ALL"); // L1 | L2 | L3 | ALL
  const plotRef = useRef(null);

  const detected = useMemo(() => {
    if (!rows.length) return null;
    const cols = Object.keys(rows[0] || {});

    // Time
    const timeCol = pickColumn(cols, [
      "Time",
      "time",
      "Fecha",
      "FECHA",
      "Datetime",
      "DateTime",
    ]);

    // Voltajes
    const vL1 = pickColumn(cols, [
      "Urms_L1_MAX",
      "Urms_L1_Max",
      "Urms_L1",
      "Vrms_L1_MAX",
    ]);
    const vL2 = pickColumn(cols, [
      "Urms_L2_MAX",
      "Urms_L2_Max",
      "Urms_L2",
      "Vrms_L2_MAX",
    ]);
    const vL3 = pickColumn(cols, [
      "Urms_L3_MAX",
      "Urms_L3_Max",
      "Urms_L3",
      "Vrms_L3_MAX",
    ]);

    // Corrientes
    const iL1 = pickColumn(cols, ["Irms_L1_MAX", "Irms_L1_Max", "Irms_L1"]);
    const iL2 = pickColumn(cols, ["Irms_L2_MAX", "Irms_L2_Max", "Irms_L2"]);
    const iL3 = pickColumn(cols, ["Irms_L3_MAX", "Irms_L3_Max", "Irms_L3"]);

    // Potencias
    const pL1 = pickColumn(cols, ["P_L1_MAX", "P_L1_Max", "P_L1"]);
    const pL2 = pickColumn(cols, ["P_L2_MAX", "P_L2_Max", "P_L2"]);
    const pL3 = pickColumn(cols, ["P_L3_MAX", "P_L3_Max", "P_L3"]);
    const pAll = pickColumn(cols, [
      "P_All_MAX",
      "P_All_Max",
      "P_All",
      "P_Total",
      "P_Total_MAX",
    ]);

    return {
      cols,
      timeCol,
      voltaje: { L1: vL1, L2: vL2, L3: vL3 },
      corriente: { L1: iL1, L2: iL2, L3: iL3 },
      potencia: { L1: pL1, L2: pL2, L3: pL3, ALL: pAll },
    };
  }, [rows]);

  const chart = useMemo(() => {
    if (!rows.length || !detected?.timeCol)
      return { traces: [], title: "Sin datos" };

    const x = rows
      .map((r) => parseTime(r[detected.timeCol]))
      .filter((d) => d !== null);

    const traces = [];

    const addTrace = (name, yKey) => {
      if (!yKey) return;
      const y = rows.map((r) => toNumber(r[yKey]));
      traces.push({ x, y, type: "scatter", mode: "lines", name });
    };

    if (metric === "voltaje") {
      const m = detected.voltaje;
      if (phase === "ALL") {
        addTrace("L1", m.L1);
        addTrace("L2", m.L2);
        addTrace("L3", m.L3);
      } else {
        addTrace(phase, m[phase]);
      }
      return {
        traces,
        title: `Voltaje - ${phase === "ALL" ? "Todas" : phase}`,
      };
    }

    if (metric === "corriente") {
      const m = detected.corriente;
      if (phase === "ALL") {
        addTrace("L1", m.L1);
        addTrace("L2", m.L2);
        addTrace("L3", m.L3);
      } else {
        addTrace(phase, m[phase]);
      }
      return {
        traces,
        title: `Corriente - ${phase === "ALL" ? "Todas" : phase}`,
      };
    }

    // potencia
    const m = detected.potencia;
    if (phase === "ALL") {
      addTrace("P L1", m.L1);
      addTrace("P L2", m.L2);
      addTrace("P L3", m.L3);
      addTrace("P Total", m.ALL);
    } else if (phase === "L1" || phase === "L2" || phase === "L3") {
      addTrace(`P ${phase}`, m[phase]);
    } else {
      addTrace("P Total", m.ALL);
    }
    return {
      traces,
      title: `Potencia - ${phase === "ALL" ? "Todas + Total" : phase}`,
    };
  }, [rows, metric, phase, detected]);

  const onUpload = (file) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const data = (res.data || []).map((row) => {
          const out = {};
          Object.keys(row || {}).forEach((k) => {
            out[normalizeKey(k)] = row[k];
          });
          return out;
        });
        setRows(data);
      },
      error: (err) => console.error(err),
    });
  };

  const exportPNG = async () => {
    try {
      const el = plotRef.current?.el;
      if (!el) return;

      // En Vite, esto funciona bien:
      const Plotly = (await import("plotly.js-dist-min")).default;
      const url = await Plotly.toImage(el, {
        format: "png",
        height: 600,
        width: 1200,
      });

      const a = document.createElement("a");
      a.href = url;
      a.download = `${metric}_${phase}.png`;
      a.click();
    } catch (e) {
      console.error(e);
      alert("No pude exportar la imagen. Revisa consola.");
    }
  };

  const missingColsMsg = useMemo(() => {
    if (!rows.length) return null;
    if (!detected?.timeCol)
      return "No encuentro la columna de fecha/hora (Time).";
    return null;
  }, [rows, detected]);

  return (
    <div
      style={{
        padding: 24,
        maxWidth: 1200,
        margin: "0 auto",
        fontFamily: "system-ui",
      }}
    >
      <h1 style={{ margin: 0 }}>Mediciones desde CSV</h1>
      <p style={{ opacity: 0.75 }}>
        Sube el CSV y genera gráficas por fase (L1/L2/L3) o todas juntas. Eje X
        = fecha/hora.
      </p>

      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          margin: "16px 0",
        }}
      >
        <input
          type="file"
          accept=".csv"
          onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
        />

        <select value={metric} onChange={(e) => setMetric(e.target.value)}>
          <option value="voltaje">Voltaje</option>
          <option value="corriente">Corriente</option>
          <option value="potencia">Potencia</option>
        </select>

        <select value={phase} onChange={(e) => setPhase(e.target.value)}>
          <option value="ALL">Todas</option>
          <option value="L1">L1</option>
          <option value="L2">L2</option>
          <option value="L3">L3</option>
        </select>

        <button onClick={exportPNG} disabled={!rows.length}>
          Exportar PNG
        </button>
      </div>

      {!rows.length ? (
        <div
          style={{ padding: 20, border: "1px dashed #aaa", borderRadius: 12 }}
        >
          Sube un CSV para ver las gráficas.
        </div>
      ) : missingColsMsg ? (
        <div
          style={{ padding: 20, border: "1px solid #f2c", borderRadius: 12 }}
        >
          {missingColsMsg}
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
            Columnas detectadas: <code>{detected?.cols?.join(", ")}</code>
          </div>
        </div>
      ) : (
        <div
          style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}
        >
          <Plot
            ref={plotRef}
            data={chart.traces}
            layout={{
              title: chart.title,
              xaxis: { title: "Fecha/Hora" },
              yaxis: {
                title:
                  metric === "voltaje"
                    ? "V"
                    : metric === "corriente"
                      ? "A"
                      : "Potencia",
              },
              legend: { orientation: "h" },
              margin: { l: 60, r: 30, t: 60, b: 60 },
            }}
            config={{ responsive: true }}
            style={{ width: "100%", height: 520 }}
          />
        </div>
      )}
    </div>
  );
}
