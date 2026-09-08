"use client";

import { useState } from "react";

export default function GoDeeperPage() {
  const [recorded, setRecorded] = useState(false);
  const recordInterest = () => {
    window.localStorage.setItem("sutriva-deeper-insight-interest", "true");
    setRecorded(true);
  };
  return <main className="shell journey"><a className="backLink" href="/">← Home</a><p className="eyebrow">Sutriva Alpha</p><h1>Go deeper</h1>
    <p className="lede">Your quick check used only the information you entered. With your permission, a deeper financial view could later use additional information such as account summaries or transaction patterns to improve the analysis.</p>
    <p className="disclaimer">No additional financial data is being collected in this Alpha step.</p>
    {recorded ? <div className="successState" role="status"><p>Thanks — we’ve recorded your interest in deeper insights.</p><a className="primaryButton" href="/">Return home</a></div> : <div className="formActions stacked"><button className="primaryButton" onClick={recordInterest}>I’m interested in deeper insights</button><a className="secondaryButton linkButton" href="/">Not now</a></div>}
  </main>;
}
