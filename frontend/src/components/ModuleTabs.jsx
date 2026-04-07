function ModuleTabs({ tabs, value, onChange }) {
  return (
    <div className="module-tabs" role="tablist" aria-label="Module sections">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          className={value === tab.value ? "module-tab module-tab--active" : "module-tab"}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export default ModuleTabs;
