import { useState, useEffect, useCallback } from "react";
import "./SearchFilter.css";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchBar({
  value,
  onChange,
  placeholder = "Search artifacts...",
}: SearchBarProps) {
  const [localValue, setLocalValue] = useState(value);

  // Debounce the onChange callback
  useEffect(() => {
    const timer = setTimeout(() => {
      onChange(localValue);
    }, 200);
    return () => clearTimeout(timer);
  }, [localValue, onChange]);

  // Sync external value changes
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleClear = () => {
    setLocalValue("");
    onChange("");
  };

  return (
    <div className="search-bar">
      <svg
        className="search-bar__icon"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
      <input
        type="text"
        className="search-bar__input"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        placeholder={placeholder}
        aria-label="Search"
      />
      {localValue && (
        <button
          className="search-bar__clear"
          onClick={handleClear}
          type="button"
          aria-label="Clear search"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

export type FilterStatus = "all" | "breaking" | "impacted" | "changed" | "verified";

interface FilterChipsProps {
  selected: FilterStatus[];
  onChange: (selected: FilterStatus[]) => void;
  counts?: Record<FilterStatus, number>;
}

export function FilterChips({ selected, onChange, counts }: FilterChipsProps) {
  const filters: { value: FilterStatus; label: string; color: string }[] = [
    { value: "all", label: "All", color: "neutral" },
    { value: "breaking", label: "Breaking", color: "error" },
    { value: "impacted", label: "Impacted", color: "warning" },
    { value: "changed", label: "Changed", color: "info" },
    { value: "verified", label: "Verified", color: "success" },
  ];

  const handleClick = (value: FilterStatus) => {
    if (value === "all") {
      onChange(["all"]);
    } else {
      let newSelected: FilterStatus[] = selected.filter((s) => s !== "all");
      if (newSelected.includes(value)) {
        newSelected = newSelected.filter((s) => s !== value);
        if (newSelected.length === 0) {
          newSelected = ["all"];
        }
      } else {
        newSelected = [...newSelected, value];
      }
      onChange(newSelected);
    }
  };

  return (
    <div className="filter-chips">
      {filters.map((filter) => (
        <button
          key={filter.value}
          className={`filter-chip filter-chip--${filter.color} ${
            selected.includes(filter.value) ? "filter-chip--active" : ""
          }`}
          onClick={() => handleClick(filter.value)}
          type="button"
        >
          <span className="filter-chip__label">{filter.label}</span>
          {counts && filter.value !== "all" && counts[filter.value] > 0 && (
            <span className="filter-chip__count">{counts[filter.value]}</span>
          )}
        </button>
      ))}
    </div>
  );
}

interface SearchFilterBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  selectedFilters: FilterStatus[];
  onFilterChange: (filters: FilterStatus[]) => void;
  resultCount: number;
  totalCount: number;
  counts?: Record<FilterStatus, number>;
}

export function SearchFilterBar({
  searchValue,
  onSearchChange,
  selectedFilters,
  onFilterChange,
  resultCount,
  totalCount,
  counts,
}: SearchFilterBarProps) {
  const hasActiveFilters =
    searchValue.length > 0 || (selectedFilters.length > 0 && !selectedFilters.includes("all"));

  const handleClearAll = () => {
    onSearchChange("");
    onFilterChange(["all"]);
  };

  return (
    <div className="search-filter-bar">
      <div className="search-filter-bar__top">
        <SearchBar
          value={searchValue}
          onChange={onSearchChange}
          placeholder="Search by name, type, or file path..."
        />
        <div className="search-filter-bar__meta">
          <span className="search-filter-bar__count">
            {resultCount === totalCount
              ? `${totalCount} artifacts`
              : `${resultCount} of ${totalCount} artifacts`}
          </span>
          {hasActiveFilters && (
            <button className="search-filter-bar__clear" onClick={handleClearAll} type="button">
              Clear filters
            </button>
          )}
        </div>
      </div>
      <FilterChips selected={selectedFilters} onChange={onFilterChange} counts={counts} />
    </div>
  );
}

// Hook for managing search and filter state
export function useSearchFilter<T>(
  items: T[],
  searchFn: (item: T, query: string) => boolean,
  filterFn: (item: T, filters: FilterStatus[]) => boolean
) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilters, setSelectedFilters] = useState<FilterStatus[]>(["all"]);

  const filteredItems = useCallback(() => {
    return items.filter((item) => {
      const matchesSearch = searchQuery === "" || searchFn(item, searchQuery);
      const matchesFilter = selectedFilters.includes("all") || filterFn(item, selectedFilters);
      return matchesSearch && matchesFilter;
    });
  }, [items, searchQuery, selectedFilters, searchFn, filterFn]);

  return {
    searchQuery,
    setSearchQuery,
    selectedFilters,
    setSelectedFilters,
    filteredItems: filteredItems(),
    totalCount: items.length,
  };
}
