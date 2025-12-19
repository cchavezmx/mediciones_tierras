import React, { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import Plot from "react-plotly.js";

function toNumber(v) {
  if (v === null || v === undefined) return null;
  const raw = String(v).trim();
  // Limpia separadores y detecta decimal con coma
  let s = raw.replace(/\s+/g, "");
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    // miles con coma, decimal con punto -> quita comas
    s = s.replace(/,/g, "");
  } else if (s.includes(",") && !s.includes(".")) {
    // decimal con coma
    s = s.replace(/,/g, ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseTime(v) {
  const s = String(v || "").trim();
  // Acepta dd/mm/yyyy HH:MM o dd/mm/yyyy HH:MM:SS
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yyyy = Number(m[3]);
    const HH = Number(m[4]);
    const MM = Number(m[5]);
    const SS = Number(m[6] || 0);
    return new Date(yyyy, mm - 1, dd, HH, MM, SS);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

const expected = {
  time: "Time",
  urms: { L1: "Urms L1 MAX", L2: "Urms L2 MAX", L3: "Urms L3 MAX" },
  irms: { L1: "Irms L1 MAX", L2: "Irms L2 MAX", L3: "Irms L3 MAX" },
  ipk: { L1: "Ipk L1 MAX", L2: "Ipk L2 MAX", L3: "Ipk L3 MAX" }, // corriente pico
  potencia: {
    L1: "P L1 MAX",
    L2: "P L2 MAX",
    L3: "P L3 MAX",
    ALL: "P All MAX",
  },
};

function matchesLine(colName, line) {
  if (!line || line === "ALL") return true;
  const ln = String(line || "").toUpperCase();
  const c = String(colName || "").toUpperCase();
  return c.includes(` ${ln} `) || c.endsWith(` ${ln}`) || c.startsWith(`${ln} `) || c.includes(`${ln}_`);
}

export default function App() {
  const [rows, setRows] = useState([]);
  const [metric, setMetric] = useState("all"); // all | urms | irms | ipk | potencia | pall
  const [phase, setPhase] = useState("ALL"); // L1 | L2 | L3 | ALL (para métricas por fase)
  const [lineFilter, setLineFilter] = useState("ALL"); // Filtro para "Todas las columnas"
  const plotRef = useRef(null);

  const detected = useMemo(() => {
    if (!rows.length) return null;
    const cols = Object.keys(rows[0] || {});

    const timeCol = expected.time;

    const urms = {
      L1: cols.includes(expected.urms.L1) ? expected.urms.L1 : null,
      L2: cols.includes(expected.urms.L2) ? expected.urms.L2 : null,
      L3: cols.includes(expected.urms.L3) ? expected.urms.L3 : null,
    };

    const irms = {
      L1: cols.includes(expected.irms.L1) ? expected.irms.L1 : null,
      L2: cols.includes(expected.irms.L2) ? expected.irms.L2 : null,
      L3: cols.includes(expected.irms.L3) ? expected.irms.L3 : null,
    };

    const ipk = {
      L1: cols.includes(expected.ipk.L1) ? expected.ipk.L1 : null,
      L2: cols.includes(expected.ipk.L2) ? expected.ipk.L2 : null,
      L3: cols.includes(expected.ipk.L3) ? expected.ipk.L3 : null,
    };

    const potencia = {
      L1: cols.includes(expected.potencia.L1) ? expected.potencia.L1 : null,
      L2: cols.includes(expected.potencia.L2) ? expected.potencia.L2 : null,
      L3: cols.includes(expected.potencia.L3) ? expected.potencia.L3 : null,
      ALL: cols.includes(expected.potencia.ALL) ? expected.potencia.ALL : null,
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
      traces.push({ x, y, type: "scatter", mode: "lines", name, connectgaps: true });
    };

    if (metric === "all") {
      const candidates = (detected.cols || [])
        .filter((c) => c !== detected.timeCol)
        .filter((c) => matchesLine(c, lineFilter));
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

    if (metric === "pall") {
      const m = detected.potencia;
      addTrace("P Total (All)", m.ALL);
      return { traces, title: "PALL - Potencia total", yTitle: "W" };
    }

    const m = detected.potencia;
    if (phase === "ALL") {
      addTrace("P L1", m.L1);
      addTrace("P L2", m.L2);
      addTrace("P L3", m.L3);
      addTrace("P Total (All)", m.ALL);
      return { traces, title: `Potencia - Todas + Total`, yTitle: "W" };
    }

    addTrace(`P ${phase}`, m[phase]);
    return { traces, title: `Potencia - ${phase}`, yTitle: "W" };
  }, [rows, metric, phase, detected]);

  const onUpload = (file) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      delimitersToGuess: [",", ";", "\t", "|"],
      transformHeader: (h) => String(h || "").replace(/^\uFEFF/, "").trim(),
      transform: (value) => (typeof value === "string" ? value.trim() : value),
      complete: (res) => {
        console.log("Parsed CSV:", res);
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
    if (metric === "irms" && !check(detected.irms)) return "No encuentro Irms L1/L2/L3 MAX.";
    if (metric === "ipk" && !check(detected.ipk)) return "No encuentro Ipk L1/L2/L3 MAX.";
    if ((metric === "potencia" || metric === "pall") && !check(detected.potencia)) return "No encuentro P L1/L2/L3 MAX o P All MAX.";
    return null;
  }, [rows, detected, metric]);

  // Si se elige PALL, fijamos fase en ALL para evitar confusión
  useEffect(() => {
    if (metric === "pall" && phase !== "ALL") {
      setPhase("ALL");
    }
  }, [metric, phase]);

  return (
    <>
      <section className="hero is-gradient is-small">
        <div className="hero-body">
          <div className="container">
            <p className="subtitle has-text-white mb-2">Panel de mediciones</p>
            <h1 className="title has-text-white mb-3">CSV → Gráficas por fase</h1>
            <p className="has-text-white-bis">
              Sube tu CSV con columnas *_MAX en este orden fijo: Time, Urms L1/2/3, Irms L1/2/3, Ipk L1/2/3, P L1/2/3,
              P All. Visualiza por línea (L1, L2, L3) o todas.
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="columns is-variable is-5">
            <div className="column is-4-desktop is-12-tablet">
              <div className="card">
                <div className="card-content">
                  <p className="title is-5 mb-3">Configuración</p>
                  <div className="field">
                    <label className="label">Archivo CSV</label>
                    <div className="control">
                      <input
                        className="input"
                        type="file"
                        accept=".csv"
                        onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
                      />
                    </div>
                  </div>

                  <div className="field is-grouped is-grouped-multiline">
                    <div className="control">
                      <div className="select is-fullwidth">
                        <select value={metric} onChange={(e) => setMetric(e.target.value)}>
                          <option value="all">Todas las columnas</option>
                          <option value="urms">Voltaje (Urms)</option>
                          {/* LRMS no existe en el CSV fijo, usamos Irms */}
                          <option value="irms">Corriente (Irms)</option>
                          <option value="ipk">Corriente pico (Ipk)</option>
                          <option value="potencia">Potencia (P)</option>
                          <option value="pall">P Total (PALL)</option>
                        </select>
                      </div>
                    </div>

                    {metric === "all" && (
                      <div className="control">
                        <div className="select is-fullwidth">
                          <select value={lineFilter} onChange={(e) => setLineFilter(e.target.value)}>
                            <option value="ALL">Todas las líneas</option>
                            <option value="L1">Solo L1</option>
                            <option value="L2">Solo L2</option>
                            <option value="L3">Solo L3</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {metric !== "all" && metric !== "pall" && (
                      <div className="control">
                        <div className="select is-fullwidth">
                          <select value={phase} onChange={(e) => setPhase(e.target.value)}>
                            <option value="ALL">Todas</option>
                            <option value="L1">L1</option>
                            <option value="L2">L2</option>
                            <option value="L3">L3</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="buttons mt-2">
                    <button className="button is-primary" onClick={exportPNG} disabled={!rows.length || !!missing}>
                      Exportar PNG
                    </button>
                  </div>

                  {rows.length > 0 && (
                    <p className="is-size-7 has-text-grey mt-2">
                      Columnas detectadas: <code>{detected?.cols?.join(", ")}</code>
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="column is-8-desktop is-12-tablet">
              {!rows.length ? (
                <div className="notification is-light">Sube un CSV para ver las gráficas.</div>
              ) : missing ? (
                <div className="notification is-danger">
                  {missing}
                  <div className="is-size-7 mt-1">
                    Columnas detectadas: <code>{detected?.cols?.join(", ")}</code>
                  </div>
                </div>
              ) : (
                <div className="card">
                  <div className="card-content">
                    <Plot
                      ref={plotRef}
                      data={chart.traces}
                      layout={{
                        title: chart.title,
                        xaxis: {
                          title: "Fecha/Hora",
                          rangeslider: { visible: true },
                          rangeselector: {
                            buttons: [
                              { count: 1, label: "1d", step: "day", stepmode: "backward" },
                              { count: 3, label: "3d", step: "day", stepmode: "backward" },
                              { count: 7, label: "7d", step: "day", stepmode: "backward" },
                              { step: "all", label: "Todo" },
                            ],
                          },
                        },
                        yaxis: { title: chart.yTitle },
                        legend: { orientation: "h" },
                        margin: { l: 60, r: 30, t: 60, b: 60 },
                      }}
                      config={{ responsive: true }}
                      style={{ width: "100%", height: 520 }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
