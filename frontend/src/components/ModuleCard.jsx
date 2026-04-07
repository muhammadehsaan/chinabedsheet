import { Link } from "react-router-dom";

function ModuleCard({ title, description, route, features }) {
  return (
    <article className="module-card">
      <div className="module-head">
        <h3>{title}</h3>
        <Link to={route} className="module-link">
          Open
        </Link>
      </div>
      <p>{description}</p>
      <ul>
        {features.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
    </article>
  );
}

export default ModuleCard;
