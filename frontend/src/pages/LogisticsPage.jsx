import { useState } from "react";

import ModuleTabs from "../components/ModuleTabs";

const tabs = [
  { value: "claims", label: "Claim Management" },
  { value: "delivery", label: "Delivery Manager" },
  { value: "riders", label: "Rider Tracking" },
  { value: "labels", label: "Shipping Labels" },
];

const claims = [
  { id: "CL-1001", customer: "Rehan Hotel", status: "Pending" },
  { id: "CL-1002", customer: "Aqeel Tailors", status: "Resolved" },
];

const deliveries = [
  { id: "SA-1594", status: "Hold" },
  { id: "SA-1583", status: "Deliver" },
  { id: "SA-1582", status: "Not Deliver" },
];

const riders = [
  { name: "Bilal", location: "Gulberg" },
  { name: "Hassan", location: "Model Town" },
];

const labels = [
  { id: "SA-1594", status: "Ready" },
  { id: "SA-1583", status: "Pending" },
];

function LogisticsPage() {
  const [activeTab, setActiveTab] = useState("claims");

  return (
    <section className="module-page">
      <header className="module-header">
        <h3>Logistics & CRM</h3>
        <span className="module-subtitle">Claims, delivery status, rider tracking and labels</span>
      </header>

      <ModuleTabs tabs={tabs} value={activeTab} onChange={setActiveTab} />

      {activeTab === "claims" && (
        <div className="summary-grid two-wide">
          <form className="module-card form-card">
            <h4>Save Claim</h4>
            <label>
              Customer
              <input type="text" placeholder="Customer name" />
            </label>
            <label>
              Claim Details
              <input type="text" placeholder="Reason / issue" />
            </label>
            <button type="button">Save Claim</button>
          </form>
          <article className="module-card">
            <h4>Pending Claims</h4>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Customer</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {claims.map((row) => (
                    <tr key={row.id}>
                      <td>{row.id}</td>
                      <td>{row.customer}</td>
                      <td>
                        <span className={row.status === "Pending" ? "status-pill" : "status-pill status-pill--active"}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </div>
      )}

      {activeTab === "delivery" && (
        <article className="module-card">
          <h4>Delivery Manager</h4>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Status</th>
                  <th>Update</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>
                      <span className={`status-pill status-pill--${row.status.toLowerCase().replace(" ", "-")}`}>
                        {row.status}
                      </span>
                    </td>
                    <td>
                      <div className="inline-actions">
                        <button type="button" className="small-btn">
                          Hold
                        </button>
                        <button type="button" className="small-btn small-btn--ghost">
                          Deliver
                        </button>
                        <button type="button" className="small-btn small-btn--danger">
                          Not Deliver
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}

      {activeTab === "riders" && (
        <article className="module-card">
          <h4>Rider Tracking</h4>
          <div className="summary-grid two-wide">
            <div className="map-placeholder">Live map placeholder</div>
            <ul className="mini-list">
              {riders.map((rider) => (
                <li key={rider.name}>
                  <span>{rider.name}</span>
                  <strong>{rider.location}</strong>
                </li>
              ))}
            </ul>
          </div>
        </article>
      )}

      {activeTab === "labels" && (
        <article className="module-card">
          <h4>Shipping Labels</h4>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Status</th>
                  <th>Print</th>
                </tr>
              </thead>
              <tbody>
                {labels.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>
                      <span className={row.status === "Ready" ? "status-pill status-pill--active" : "status-pill"}>
                        {row.status}
                      </span>
                    </td>
                    <td>
                      <button type="button" className="small-btn">
                        Print Label
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}
    </section>
  );
}

export default LogisticsPage;
