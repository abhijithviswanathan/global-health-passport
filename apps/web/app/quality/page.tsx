"use client";
import { useState } from "react";
import Home from "../page";
export default function Quality() {
  const [report, setReport] = useState("Not run");
  return (
    <>
      <Home />
      {process.env.NODE_ENV === "development" && (
        <aside
          id="quality-console"
          aria-label="Development accessibility checks"
          style={{
            position: "fixed",
            bottom: 8,
            right: 8,
            zIndex: 100,
            maxWidth: 340,
            maxHeight: "40vh",
            overflow: "auto",
            padding: 12,
            background: "#fff",
            color: "#111",
            border: "2px solid #333",
            borderRadius: 8,
            fontSize: 14,
          }}
        >
          <button
            style={{ padding: 8, border: "1px solid #333" }}
            onClick={async () => {
              setReport("Running…");
              try {
                const axe = (await import("axe-core")).default;
                const r = await axe.run(
                  { exclude: [["#quality-console"]] },
                  {
                    runOnly: {
                      type: "tag",
                      values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
                    },
                  },
                );
                setReport(
                  JSON.stringify(
                    {
                      violations: r.violations.map((v) => ({
                        id: v.id,
                        impact: v.impact,
                        description: v.description,
                        nodes: v.nodes.map((n) => ({
                          target: n.target,
                          summary: n.failureSummary,
                        })),
                      })),
                      passes: r.passes.length,
                      incomplete: r.incomplete.length,
                    },
                    null,
                    2,
                  ),
                );
              } catch (e) {
                setReport(String(e));
              }
            }}
          >
            Run accessibility audit
          </button>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{report}</pre>
        </aside>
      )}
    </>
  );
}
