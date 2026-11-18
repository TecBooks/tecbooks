import React from "react";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";
import { compactCurrency } from "../format.js";

const BLUE = "#1f6f8b";
const RED = "#c0392b";
const NAVY = "#073a5a";
const FONT = { fontSize: "15px" };

const baseOptions = {
  chart: { style: { fontFamily: "inherit", fontSize: "15px" } },
  credits: { enabled: false },
  legend: { itemStyle: FONT },
};

function Chart({ options }) {
  return (
    <div style={{ width: "100%", maxWidth: 900 }}>
      <HighchartsReact highcharts={Highcharts} options={{ ...baseOptions, ...options }} />
    </div>
  );
}

/** Histogram of VNA with 0 and P5 / P50 / P95 marked (PDF Fig. 6, top-left). */
export function NpvHistogram({ result, currency }) {
  const { counts, edges } = result.histogramNpv;
  const width = edges.length > 1 ? edges[1] - edges[0] : 1;
  const data = counts.map((count, i) => {
    const center = (edges[i] + edges[i + 1]) / 2;
    return { x: center, y: count, color: center < 0 ? RED : BLUE };
  });
  const { p5, p50, p95 } = result.kpis.npv;
  const marker = (value, text, color = NAVY) => ({
    value,
    color,
    width: 1.5,
    dashStyle: "Dash",
    zIndex: 5,
    label: { text, rotation: 0, y: 14, style: { fontSize: "13px", color } },
  });

  return (
    <Chart
      options={{
        chart: { ...baseOptions.chart, type: "column" },
        title: { text: `VNA distribution (${result.meta.valid.toLocaleString("en-US")} simulations)`, style: { fontSize: "19px" } },
        xAxis: {
          title: { text: "VNA", style: FONT },
          labels: { style: FONT, formatter() { return compactCurrency(this.value, currency); } },
          plotLines: [
            { value: 0, color: "#888", width: 2, zIndex: 4 },
            marker(p5, "P5"),
            marker(p50, "P50"),
            marker(p95, "P95"),
          ],
        },
        yAxis: { title: { text: "Simulations", style: FONT }, labels: { style: FONT } },
        legend: { enabled: false },
        tooltip: {
          style: FONT,
          formatter() {
            return `${compactCurrency(this.x - width / 2, currency)} – ${compactCurrency(this.x + width / 2, currency)}<br/><b>${this.y}</b> simulations`;
          },
        },
        plotOptions: { column: { pointPadding: 0, groupPadding: 0, borderWidth: 0.5, pointRange: width } },
        series: [{ name: "VNA", data }],
      }}
    />
  );
}

/** Spearman tornado: which input moves VNA the most (PDF eq. 13). */
export function NpvTornado({ result }) {
  const rows = result.tornadoNpv;
  return (
    <Chart
      options={{
        chart: { ...baseOptions.chart, type: "bar", height: Math.max(220, 60 + rows.length * 42) },
        title: { text: "VNA sensitivity (Spearman rank correlation)", style: { fontSize: "19px" } },
        xAxis: { categories: rows.map((r) => r.label ?? r.variable), labels: { style: FONT } },
        yAxis: {
          min: -1,
          max: 1,
          title: { text: "← lowers VNA · raises VNA →", style: FONT },
          labels: { style: FONT },
          plotLines: [{ value: 0, color: "#888", width: 1 }],
        },
        legend: { enabled: false },
        tooltip: {
          style: FONT,
          formatter() {
            const row = rows[this.point.index];
            return `<b>${this.key}</b><br/>ρ = ${row.spearman.toFixed(2)}<br/>≈ ${(row.contribution * 100).toFixed(0)}% of the variance explained`;
          },
        },
        series: [
          {
            name: "Spearman ρ",
            data: rows.map((r) => Number(r.spearman.toFixed(3))),
            color: BLUE,
            negativeColor: RED,
            dataLabels: { enabled: true, format: "{y:.2f}", style: { fontSize: "13px" } },
          },
        ],
      }}
    />
  );
}

/** Yearly cash flow series: mean with the P5-P95 range (PDF Fig. 6, cash flow). */
export function CashFlowBands({ result, currency }) {
  const { years, mean, p5, p95 } = result.cashFlowBands;
  return (
    <Chart
      options={{
        chart: { ...baseOptions.chart, type: "line" },
        title: { text: "Net flow per year: mean and P5–P95", style: { fontSize: "19px" } },
        xAxis: { categories: years.map(String), labels: { style: FONT } },
        yAxis: {
          title: { text: "Net flow", style: FONT },
          labels: { style: FONT, formatter() { return compactCurrency(this.value, currency); } },
          plotLines: [{ value: 0, color: "#888", width: 1 }],
        },
        tooltip: {
          shared: true,
          style: FONT,
          pointFormatter() {
            return `<span style="color:${this.color}">●</span> ${this.series.name}: <b>${compactCurrency(this.y, currency)}</b><br/>`;
          },
        },
        series: [
          { name: "P95", data: p95, color: BLUE, dashStyle: "Dash", marker: { enabled: false } },
          { name: "Mean", data: mean, color: NAVY, lineWidth: 3 },
          { name: "P5", data: p5, color: RED, dashStyle: "Dash", marker: { enabled: false } },
        ],
      }}
    />
  );
}

/** P(VNA < 0) as N grows, with its 95% CI (PDF eq. 5, Fig. 6 bottom-right). */
export function ConvergenceChart({ result }) {
  const points = result.convergence;
  return (
    <Chart
      options={{
        chart: { ...baseOptions.chart, type: "line" },
        title: { text: "Convergence of P(VNA < 0) with N", style: { fontSize: "19px" } },
        xAxis: {
          type: "logarithmic",
          title: { text: "Number of simulations (log scale)", style: FONT },
          labels: { style: FONT },
        },
        yAxis: {
          min: 0,
          max: 1,
          title: { text: "P(VNA < 0)", style: FONT },
          labels: { style: FONT, formatter() { return `${Math.round(this.value * 100)}%`; } },
        },
        tooltip: { shared: true, valueDecimals: 3, style: FONT },
        series: [
          { name: "CI 95% high", data: points.map((p) => [p.n, p.high]), color: "#94a3b8", dashStyle: "Dot", marker: { enabled: false } },
          { name: "P(VNA < 0)", data: points.map((p) => [p.n, p.p]), color: NAVY, lineWidth: 3 },
          { name: "CI 95% low", data: points.map((p) => [p.n, p.low]), color: "#94a3b8", dashStyle: "Dot", marker: { enabled: false } },
        ],
      }}
    />
  );
}
