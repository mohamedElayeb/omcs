'use client';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from '../lib/i18n';
import './SearchBar.css';

// ─── Types ───
export type SearchMode = 'all' | 'sku' | 'name' | 'brand' | 'size' | 'category' | 'branch';

export interface SearchSuggestion {
    id: string;
    label: string;
    secondary?: string;
    badge?: string;
    icon?: string;
    type: 'product' | 'sku' | 'brand' | 'category' | 'branch';
}

export interface SearchBarProps {
    /** Current raw search input */
    value: string;
    /** Called on every keystroke (raw input) */
    onChange: (value: string) => void;
    /** Called after debounce with the debounced value and active mode */
    onDebouncedChange?: (value: string, mode: SearchMode) => void;
    /** Called when user selects a suggestion */
    onSuggestionSelect?: (suggestion: SearchSuggestion) => void;
    /** Placeholder text */
    placeholder?: string;
    /** Autocomplete suggestions to show */
    suggestions?: SearchSuggestion[];
    /** Result count to display after search */
    resultCount?: number;
    /** The label for the result entity (e.g. "products", "items") — use i18n key */
    resultLabel?: string;
    /** Whether search is currently loading (shows spinner) */
    isSearching?: boolean;
    /** Auto-focus on mount */
    autoFocus?: boolean;
    /** Search modes to display as chips */
    modes?: SearchMode[];
    /** Active mode */
    activeMode?: SearchMode;
    /** Called when mode changes */
    onModeChange?: (mode: SearchMode) => void;
    /** localStorage key for persisting query + mode (set null to disable) */
    storageKey?: string | null;
    /** Debounce delay in ms (default: 280) */
    debounceMs?: number;
}

// ─── Advanced syntax parser ───
interface ParsedQuery {
    raw: string;
    clean: string;
    filters: Record<string, string>;
}

function parseAdvancedSyntax(input: string): ParsedQuery {
    const filters: Record<string, string> = {};
    const syntaxRegex = /\b(sku|size|brand|branch|category|cat|name):(\S+)/gi;
    let clean = input;
    let match: RegExpExecArray | null;

    while ((match = syntaxRegex.exec(input)) !== null) {
        const key = match[1].toLowerCase() === 'cat' ? 'category' : match[1].toLowerCase();
        filters[key] = match[2];
        clean = clean.replace(match[0], '');
    }

    return { raw: input, clean: clean.trim(), filters };
}

// ─── Highlight match helper ───
function highlightMatch(text: string, query: string): React.ReactNode {
    if (!query || !text) return text;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    return (
        <>
            {text.slice(0, idx)}
            <span className="adv-search__match">{text.slice(idx, idx + query.length)}</span>
            {text.slice(idx + query.length)}
        </>
    );
}

// ─── Mode config ───
const MODE_CONFIG: Record<SearchMode, { icon: string; labelKey: string }> = {
    all: { icon: '🔍', labelKey: 'searchBar.modeAll' },
    sku: { icon: '🏷️', labelKey: 'searchBar.modeSku' },
    name: { icon: '📦', labelKey: 'searchBar.modeName' },
    brand: { icon: '🏪', labelKey: 'searchBar.modeBrand' },
    size: { icon: '📏', labelKey: 'searchBar.modeSize' },
    category: { icon: '📁', labelKey: 'searchBar.modeCategory' },
    branch: { icon: '🏢', labelKey: 'searchBar.modeBranch' },
};

const SUGGESTION_ICONS: Record<string, string> = {
    product: '📦',
    sku: '🏷️',
    brand: '🏪',
    category: '📁',
    branch: '🏢',
};

// ─── Component ───
export default function SearchBar({
    value,
    onChange,
    onDebouncedChange,
    onSuggestionSelect,
    placeholder,
    suggestions = [],
    resultCount,
    resultLabel,
    isSearching = false,
    autoFocus = false,
    modes,
    activeMode: controlledMode,
    onModeChange,
    storageKey = null,
    debounceMs = 280,
}: SearchBarProps) {
    const { t } = useTranslation();
    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);

    // Internal mode state (if not controlled)
    const [internalMode, setInternalMode] = useState<SearchMode>('all');
    const mode = controlledMode ?? internalMode;

    // Dropdown state
    const [showDropdown, setShowDropdown] = useState(false);
    const [highlightIdx, setHighlightIdx] = useState(-1);
    const [debouncing, setDebouncing] = useState(false);

    // Restore from localStorage on mount
    useEffect(() => {
        if (storageKey && typeof window !== 'undefined') {
            const saved = localStorage.getItem(storageKey);
            if (saved) {
                try {
                    const { query, mode: savedMode } = JSON.parse(saved);
                    if (query && !value) onChange(query);
                    if (savedMode && !controlledMode) {
                        setInternalMode(savedMode);
                        onModeChange?.(savedMode);
                    }
                } catch { /* ignore */ }
            }
        }
    }, []);

    // Persist on change
    useEffect(() => {
        if (storageKey && typeof window !== 'undefined') {
            localStorage.setItem(storageKey, JSON.stringify({ query: value, mode }));
        }
    }, [value, mode, storageKey]);

    // Debounce handler
    useEffect(() => {
        if (!onDebouncedChange) return;
        if (value) setDebouncing(true);
        const timer = setTimeout(() => {
            setDebouncing(false);
            onDebouncedChange(value, mode);
        }, debounceMs);
        return () => {
            clearTimeout(timer);
        };
    }, [value, mode, debounceMs]);

    // Show/hide dropdown
    useEffect(() => {
        const hasSuggestions = suggestions.length > 0 && value.trim().length > 0;
        setShowDropdown(hasSuggestions);
        setHighlightIdx(-1);
    }, [suggestions, value]);

    // Click outside to close dropdown
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Keyboard navigation
    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!showDropdown || suggestions.length === 0) {
            if (e.key === 'Escape') {
                inputRef.current?.blur();
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightIdx(prev => (prev + 1) % suggestions.length);
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightIdx(prev => (prev - 1 + suggestions.length) % suggestions.length);
                break;
            case 'Enter':
                e.preventDefault();
                if (highlightIdx >= 0 && highlightIdx < suggestions.length) {
                    handleSuggestionClick(suggestions[highlightIdx]);
                }
                break;
            case 'Escape':
                e.preventDefault();
                setShowDropdown(false);
                break;
        }
    }, [showDropdown, suggestions, highlightIdx]);

    // Scroll highlighted item into view
    useEffect(() => {
        if (highlightIdx >= 0 && dropdownRef.current) {
            const items = dropdownRef.current.querySelectorAll('.adv-search__dropdown-item');
            items[highlightIdx]?.scrollIntoView({ block: 'nearest' });
        }
    }, [highlightIdx]);

    const handleSuggestionClick = (suggestion: SearchSuggestion) => {
        onSuggestionSelect?.(suggestion);
        onChange(suggestion.label);
        setShowDropdown(false);
        inputRef.current?.focus();
    };

    const handleClear = () => {
        onChange('');
        setShowDropdown(false);
        inputRef.current?.focus();
    };

    const handleModeChange = (newMode: SearchMode) => {
        if (controlledMode !== undefined) {
            onModeChange?.(newMode);
        } else {
            setInternalMode(newMode);
            onModeChange?.(newMode);
        }
        inputRef.current?.focus();
    };

    // Global keyboard shortcut: Ctrl+K or / to focus
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey && e.key === 'k') || (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName))) {
                e.preventDefault();
                inputRef.current?.focus();
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);

    // Parse advanced syntax for display hints
    const parsed = useMemo(() => parseAdvancedSyntax(value), [value]);
    const hasAdvancedFilters = Object.keys(parsed.filters).length > 0;

    const defaultPlaceholder = t('searchBar.placeholder');
    const showSpinner = isSearching || debouncing;

    return (
        <div className="adv-search" ref={wrapRef}>
            {/* ─── INPUT ─── */}
            <div className="adv-search__input-wrap">
                <span className="adv-search__icon">🔍</span>

                {/* Syntax tags rendered before input */}
                {hasAdvancedFilters && Object.entries(parsed.filters).map(([key, val]) => (
                    <span key={key} className="adv-search__syntax-tag">
                        {key}:<strong>{val}</strong>
                    </span>
                ))}

                <input
                    ref={inputRef}
                    type="text"
                    className="adv-search__input"
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => {
                        if (suggestions.length > 0 && value.trim()) setShowDropdown(true);
                    }}
                    placeholder={placeholder || defaultPlaceholder}
                    autoFocus={autoFocus}
                    autoComplete="off"
                    spellCheck={false}
                />

                {showSpinner && <div className="adv-search__spinner" />}

                {value && (
                    <button
                        className="adv-search__clear"
                        onClick={handleClear}
                        title={t('searchBar.clear')}
                        type="button"
                    >✕</button>
                )}

                {!value && (
                    <span className="adv-search__kbd">Ctrl+K</span>
                )}
            </div>

            {/* ─── MODE CHIPS ─── */}
            {modes && modes.length > 1 && (
                <div className="adv-search__modes">
                    {modes.map(m => (
                        <button
                            key={m}
                            type="button"
                            className={`adv-search__chip ${mode === m ? 'adv-search__chip--active' : ''}`}
                            onClick={() => handleModeChange(m)}
                        >
                            {MODE_CONFIG[m].icon} {t(MODE_CONFIG[m].labelKey)}
                        </button>
                    ))}
                </div>
            )}

            {/* ─── RESULT COUNT ─── */}
            {resultCount !== undefined && value.trim() && (
                <div className="adv-search__result-count">
                    {t('searchBar.found')} <strong>{resultCount}</strong> {resultLabel || t('searchBar.results')}
                    {value.trim() && (
                        <span>— &quot;{value.trim()}&quot;</span>
                    )}
                </div>
            )}

            {/* ─── AUTOCOMPLETE DROPDOWN ─── */}
            {showDropdown && (
                <div className="adv-search__dropdown" ref={dropdownRef}>
                    <div className="adv-search__dropdown-header">
                        {t('searchBar.suggestions')}
                    </div>

                    {suggestions.length === 0 ? (
                        <div className="adv-search__dropdown-empty">
                            {t('searchBar.noSuggestions')}
                        </div>
                    ) : (
                        suggestions.map((s, idx) => (
                            <div
                                key={s.id}
                                className={`adv-search__dropdown-item ${idx === highlightIdx ? 'adv-search__dropdown-item--highlighted' : ''}`}
                                onClick={() => handleSuggestionClick(s)}
                                onMouseEnter={() => setHighlightIdx(idx)}
                            >
                                <div className="adv-search__dropdown-icon">
                                    {s.icon || SUGGESTION_ICONS[s.type] || '📋'}
                                </div>
                                <div className="adv-search__dropdown-text">
                                    <div className="adv-search__dropdown-primary">
                                        {highlightMatch(s.label, parsed.clean || value)}
                                    </div>
                                    {s.secondary && (
                                        <div className="adv-search__dropdown-secondary">
                                            {s.secondary}
                                        </div>
                                    )}
                                </div>
                                {s.badge && (
                                    <span className="adv-search__dropdown-badge">{s.badge}</span>
                                )}
                            </div>
                        ))
                    )}

                    <div className="adv-search__dropdown-hint">
                        <span><kbd>↑↓</kbd> {t('searchBar.hintNavigate')}</span>
                        <span><kbd>↵</kbd> {t('searchBar.hintSelect')}</span>
                        <span><kbd>ESC</kbd> {t('searchBar.hintClose')}</span>
                    </div>
                </div>
            )}
        </div>
    );
}
