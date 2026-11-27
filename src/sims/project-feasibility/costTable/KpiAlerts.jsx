import React from "react";
import { Alert, AlertTitle, Stack } from "@mui/material";

/** Renders buildKpiAlerts' output: title, every reason, and where to look. */
function KpiAlerts({ alerts }) {
  if (!alerts?.length) return null;

  return (
    <Stack spacing={1.5} sx={{ mt: 2 }}>
      {alerts.map((alert) => (
        <Alert key={alert.id} severity={alert.severity}>
          <AlertTitle>{alert.title}</AlertTitle>
          <ul className="ml-4 list-disc space-y-0.5">
            {alert.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <p className="mt-1 text-[13px] opacity-80">Check: {alert.source}</p>
        </Alert>
      ))}
    </Stack>
  );
}

export default KpiAlerts;
