// Constants
const STORAGE_KEY = 'hb_statsig_overrides';

// State
let currentOverrides = { gates: {}, experiments: {} };
let autoRefresh = true;
let allStatsigValues = null;

// DOM Elements
const elements = {
  status: null,
  tabs: null,
  gatesList: null,
  experimentsList: null,
  addGateForm: null,
  addExperimentForm: null,
  clearAllBtn: null,
  autoRefreshCheckbox: null,
  searchAll: null,
  allGatesList: null,
  allExperimentsList: null,
  gatesCount: null,
  experimentsCount: null
};

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  cacheElements();
  setupEventListeners();
  await loadOverrides();
}

function cacheElements() {
  elements.status = document.getElementById('status');
  elements.tabs = document.querySelectorAll('.tab');
  elements.gatesList = document.getElementById('gates-list');
  elements.experimentsList = document.getElementById('experiments-list');
  elements.addGateForm = document.getElementById('add-gate-form');
  elements.addExperimentForm = document.getElementById('add-experiment-form');
  elements.clearAllBtn = document.getElementById('clear-all');
  elements.autoRefreshCheckbox = document.getElementById('auto-refresh');
  elements.searchAll = document.getElementById('search-all');
  elements.allGatesList = document.getElementById('all-gates-list');
  elements.allExperimentsList = document.getElementById('all-experiments-list');
  elements.gatesCount = document.getElementById('gates-count');
  elements.experimentsCount = document.getElementById('experiments-count');
}

function setupEventListeners() {
  // Tab switching
  elements.tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      switchTab(tab.dataset.tab);
      if (tab.dataset.tab === 'all' && !allStatsigValues) {
        loadAllValues();
      }
    });
  });

  // Add gate form
  elements.addGateForm.addEventListener('submit', handleAddGate);

  // Add experiment form
  elements.addExperimentForm.addEventListener('submit', handleAddExperiment);

  // Clear all
  elements.clearAllBtn.addEventListener('click', handleClearAll);

  // Auto-refresh toggle
  elements.autoRefreshCheckbox.addEventListener('change', (e) => {
    autoRefresh = e.target.checked;
  });

  // Gate value toggle switch
  setupGateValueToggle();

  // Search in All tab
  elements.searchAll?.addEventListener('input', (e) => {
    const filter = e.target.value;
    renderAllGates(filter);
    renderAllExperiments(filter);
  });
}

function setupGateValueToggle() {
  const toggle = document.getElementById('gate-value-toggle');
  const hiddenInput = document.getElementById('gate-value');

  toggle.querySelectorAll('.toggle-option').forEach(option => {
    option.addEventListener('click', () => {
      const isTrue = option.classList.contains('true');
      toggle.querySelectorAll('.toggle-option').forEach(opt => opt.classList.remove('active'));
      option.classList.add('active');
      hiddenInput.value = isTrue ? 'true' : 'false';
    });
  });
}

function switchTab(tabName) {
  // Update tab buttons
  elements.tabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });

  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `${tabName}-tab`);
  });
}

// ============================================
// localStorage Operations (via scripting API)
// ============================================

async function executeInPage(func, args = []) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    throw new Error('No active tab found');
  }

  // Check for restricted URLs
  const url = tab.url || '';
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') ||
      url.startsWith('about:') || url.startsWith('edge://') || !url) {
    throw new Error('Cannot access this page. Navigate to a website first.');
  }

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: 'MAIN',
    func,
    args
  });

  return results[0]?.result;
}

async function loadOverrides() {
  try {
    const stored = await executeInPage((key) => {
      return localStorage.getItem(key);
    }, [STORAGE_KEY]);

    if (stored) {
      currentOverrides = JSON.parse(stored);
    } else {
      currentOverrides = { gates: {}, experiments: {} };
    }

    renderGates();
    renderExperiments();
    clearStatus();
  } catch (error) {
    showStatus('error', error.message || 'Navigate to a HoneyBook site to use this extension.');
  }
}

async function saveOverrides() {
  try {
    await executeInPage((key, data) => {
      localStorage.setItem(key, data);
    }, [STORAGE_KEY, JSON.stringify(currentOverrides)]);

    if (autoRefresh) {
      // Delay before refresh so user can see the visual feedback
      await new Promise(resolve => setTimeout(resolve, 250));
      await refreshPage();
    }
  } catch (error) {
    showStatus('error', 'Could not save overrides');
    throw error;
  }
}

async function refreshPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    await chrome.tabs.reload(tab.id);
    // Close popup after refresh
    window.close();
  }
}

// ============================================
// Gate Operations
// ============================================

async function handleAddGate(e) {
  e.preventDefault();

  const nameInput = document.getElementById('gate-name');
  const valueInput = document.getElementById('gate-value');

  const gateName = nameInput.value.trim();
  const gateValue = valueInput.value === 'true';

  if (!gateName) return;

  currentOverrides.gates[gateName] = gateValue;
  nameInput.value = '';

  // Update UI immediately so user sees the change
  renderGates();
  showStatus('success', `Gate "${gateName}" set to ${gateValue}`);

  try {
    await saveOverrides();
  } catch (error) {
    // Revert on error
    delete currentOverrides.gates[gateName];
    renderGates();
  }
}

async function toggleGate(gateName) {
  const currentValue = currentOverrides.gates[gateName];
  await toggleGateToValue(gateName, !currentValue);
}

async function toggleGateToValue(gateName, newValue) {
  const oldValue = currentOverrides.gates[gateName];
  currentOverrides.gates[gateName] = newValue;

  // Update UI immediately so user sees the change
  renderGates();
  showStatus('success', `Gate "${gateName}" set to ${newValue}`);

  try {
    await saveOverrides();
  } catch (error) {
    // Revert on error
    currentOverrides.gates[gateName] = oldValue;
    renderGates();
  }
}

async function removeGate(gateName) {
  const oldValue = currentOverrides.gates[gateName];
  delete currentOverrides.gates[gateName];

  // Update UI immediately so user sees the change
  renderGates();
  showStatus('success', `Gate "${gateName}" removed`);

  try {
    await saveOverrides();
  } catch (error) {
    // Revert on error
    currentOverrides.gates[gateName] = oldValue;
    renderGates();
  }
}

function renderGates() {
  const gates = currentOverrides.gates || {};
  const gateNames = Object.keys(gates);

  if (gateNames.length === 0) {
    elements.gatesList.innerHTML = '<p class="empty-message">No gate overrides</p>';
    return;
  }

  elements.gatesList.innerHTML = gateNames.map(name => {
    const value = gates[name];
    return `
      <div class="override-item">
        <span class="override-name">${escapeHtml(name)}</span>
        <div class="override-toggle-switch" data-gate="${escapeHtml(name)}">
          <span class="toggle-option false ${!value ? 'active' : ''}">false</span>
          <span class="toggle-option true ${value ? 'active' : ''}">true</span>
        </div>
        <button class="override-delete" data-gate="${escapeHtml(name)}" title="Remove">×</button>
      </div>
    `;
  }).join('');

  // Add event listeners for toggle switches
  elements.gatesList.querySelectorAll('.override-toggle-switch').forEach(toggle => {
    toggle.querySelectorAll('.toggle-option').forEach(option => {
      option.addEventListener('click', () => {
        const gateName = toggle.dataset.gate;
        const newValue = option.classList.contains('true');
        if (gates[gateName] !== newValue) {
          toggleGateToValue(gateName, newValue);
        }
      });
    });
  });

  elements.gatesList.querySelectorAll('.override-delete').forEach(btn => {
    btn.addEventListener('click', () => removeGate(btn.dataset.gate));
  });
}

// ============================================
// Experiment Operations
// ============================================

async function handleAddExperiment(e) {
  e.preventDefault();

  const nameInput = document.getElementById('experiment-name');
  const keyInput = document.getElementById('experiment-key');
  const valueInput = document.getElementById('experiment-value');

  const expName = nameInput.value.trim();
  const expKey = keyInput.value.trim();
  const expValue = parseValue(valueInput.value.trim());

  if (!expName || !expKey) return;

  // Initialize experiment if doesn't exist
  if (!currentOverrides.experiments[expName]) {
    currentOverrides.experiments[expName] = {};
  }

  currentOverrides.experiments[expName][expKey] = expValue;
  keyInput.value = '';
  valueInput.value = '';

  // Update UI immediately so user sees the change
  renderExperiments();
  showStatus('success', `Experiment "${expName}.${expKey}" set`);

  try {
    await saveOverrides();
  } catch (error) {
    // Revert on error
    delete currentOverrides.experiments[expName][expKey];
    if (Object.keys(currentOverrides.experiments[expName]).length === 0) {
      delete currentOverrides.experiments[expName];
    }
    renderExperiments();
  }
}

async function removeExperimentValue(expName, expKey) {
  const oldValue = currentOverrides.experiments[expName]?.[expKey];

  delete currentOverrides.experiments[expName][expKey];

  // Remove experiment if no keys left
  if (Object.keys(currentOverrides.experiments[expName]).length === 0) {
    delete currentOverrides.experiments[expName];
  }

  // Update UI immediately so user sees the change
  renderExperiments();
  showStatus('success', `Experiment "${expName}.${expKey}" removed`);

  try {
    await saveOverrides();
  } catch (error) {
    // Revert on error
    if (!currentOverrides.experiments[expName]) {
      currentOverrides.experiments[expName] = {};
    }
    currentOverrides.experiments[expName][expKey] = oldValue;
    renderExperiments();
  }
}

async function removeExperiment(expName) {
  const oldValues = { ...currentOverrides.experiments[expName] };
  delete currentOverrides.experiments[expName];

  // Update UI immediately so user sees the change
  renderExperiments();
  showStatus('success', `Experiment "${expName}" removed`);

  try {
    await saveOverrides();
  } catch (error) {
    // Revert on error
    currentOverrides.experiments[expName] = oldValues;
    renderExperiments();
  }
}

function renderExperiments() {
  const experiments = currentOverrides.experiments || {};
  const expNames = Object.keys(experiments);

  if (expNames.length === 0) {
    elements.experimentsList.innerHTML = '<p class="empty-message">No experiment overrides</p>';
    return;
  }

  elements.experimentsList.innerHTML = expNames.map(name => {
    const values = experiments[name];
    const valueRows = Object.entries(values).map(([key, value]) => `
      <div class="experiment-value-row">
        <span class="experiment-key">${escapeHtml(key)}:</span>
        <span class="experiment-val">${escapeHtml(formatValue(value))}</span>
        <button
          class="override-delete"
          data-exp="${escapeHtml(name)}"
          data-key="${escapeHtml(key)}"
          title="Remove"
        >×</button>
      </div>
    `).join('');

    return `
      <div class="experiment-item">
        <div class="experiment-header">
          <span class="experiment-name">${escapeHtml(name)}</span>
          <button
            class="override-delete"
            data-exp="${escapeHtml(name)}"
            title="Remove all"
          >×</button>
        </div>
        <div class="experiment-values">
          ${valueRows}
        </div>
      </div>
    `;
  }).join('');

  // Add event listeners for individual value deletion
  elements.experimentsList.querySelectorAll('.experiment-value-row .override-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      removeExperimentValue(btn.dataset.exp, btn.dataset.key);
    });
  });

  // Add event listeners for entire experiment deletion
  elements.experimentsList.querySelectorAll('.experiment-header .override-delete').forEach(btn => {
    btn.addEventListener('click', () => removeExperiment(btn.dataset.exp));
  });
}

// ============================================
// Clear All
// ============================================

async function handleClearAll() {
  if (!confirm('Clear all overrides?')) return;

  const oldOverrides = { ...currentOverrides };
  currentOverrides = { gates: {}, experiments: {} };

  // Update UI immediately so user sees the change
  renderGates();
  renderExperiments();
  showStatus('success', 'All overrides cleared');

  try {
    await saveOverrides();
  } catch (error) {
    // Revert on error
    currentOverrides = oldOverrides;
    renderGates();
    renderExperiments();
  }
}

// ============================================
// All Statsig Values (All Tab)
// ============================================

async function fetchAllStatsigValues() {
  return await executeInPage(() => {
    const apiKey = window.statsig_client_api_key;
    if (!apiKey) return { error: 'No API key found' };

    // Try to get the StatsigClient class from window
    const StatsigClientClass = window.StatsigClient;
    if (!StatsigClientClass) return { error: 'StatsigClient not found on window' };

    const client = StatsigClientClass.instance?.(apiKey);
    if (!client) return { error: 'Could not get client instance' };
    if (client.loadingStatus === 'Uninitialized') return { error: 'Client not initialized' };

    // Access the internal store which has getValues()
    const store = client._store;
    if (!store) {
      return { error: 'Could not access client store' };
    }

    // getValues() returns the raw response from Statsig
    const rawValues = store.getValues?.();
    if (!rawValues) {
      return { error: 'No values in store (client may still be loading)' };
    }

    // V2 format uses compressed keys, V1 uses full names
    // feature_gates is an object where keys are gate names
    // dynamic_configs is an object where keys are experiment/config names
    const featureGates = rawValues.feature_gates || {};
    const dynamicConfigs = rawValues.dynamic_configs || {};
    const valuesLookup = rawValues.values || {}; // V2 uses this for config values

    // Parse gates - in V2, each gate has: v (value), r (rule_id), etc.
    const gates = Object.entries(featureGates).map(([name, gate]) => {
      // Handle both V1 (full property names) and V2 (compressed) formats
      const value = gate.v !== undefined ? gate.v === true : gate.value;
      const ruleId = gate.r || gate.rule_id || 'default';
      return { name, value, ruleId };
    });

    // Parse experiments/configs - in V2, v is an index into valuesLookup
    const experiments = Object.entries(dynamicConfigs).map(([name, config]) => {
      // V2: config.v is an index into valuesLookup
      // V1: config.value is the actual value
      let value = config.value;
      if (config.v !== undefined && typeof config.v === 'number') {
        value = valuesLookup[config.v] || {};
      } else if (config.v !== undefined) {
        value = config.v;
      }

      const ruleId = config.r || config.rule_id || 'default';
      const groupName = config.gn || config.group_name;

      return { name, value, ruleId, groupName };
    });

    return { gates, experiments };
  });
}

async function loadAllValues() {
  // Show loading state
  if (elements.allGatesList) {
    elements.allGatesList.innerHTML = '<p class="empty-message">Loading...</p>';
  }
  if (elements.allExperimentsList) {
    elements.allExperimentsList.innerHTML = '<p class="empty-message">Loading...</p>';
  }

  try {
    const result = await fetchAllStatsigValues();

    console.log('Statsig DevTools - fetchAllStatsigValues result:', result);

    // Check for null/undefined result
    if (!result) {
      if (elements.allGatesList) {
        elements.allGatesList.innerHTML = '<p class="empty-message">No data returned from page</p>';
      }
      if (elements.allExperimentsList) {
        elements.allExperimentsList.innerHTML = '<p class="empty-message">Make sure you are on a HoneyBook page</p>';
      }
      return;
    }

    // Check for errors from the fetch
    if (result.error) {
      if (elements.allGatesList) {
        elements.allGatesList.innerHTML = `<p class="empty-message">${escapeHtml(result.error)}</p>`;
      }
      if (elements.allExperimentsList) {
        elements.allExperimentsList.innerHTML = '<p class="empty-message">See console for debug info</p>';
      }
      console.log('Statsig DevTools debug:', result);
      return;
    }

    allStatsigValues = result;
    renderAllGates();
    renderAllExperiments();
  } catch (error) {
    console.error('Statsig DevTools error:', error);
    if (elements.allGatesList) {
      elements.allGatesList.innerHTML = `<p class="empty-message">Error: ${escapeHtml(error.message || String(error))}</p>`;
    }
    if (elements.allExperimentsList) {
      elements.allExperimentsList.innerHTML = '<p class="empty-message">Could not load experiments</p>';
    }
  }
}

function renderAllGates(filter = '') {
  if (!elements.allGatesList) return;

  if (!allStatsigValues?.gates) {
    elements.allGatesList.innerHTML = '<p class="empty-message">No gates found (Statsig not initialized?)</p>';
    if (elements.gatesCount) elements.gatesCount.textContent = '0';
    return;
  }

  const filtered = allStatsigValues.gates
    .filter(g => g.name.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (elements.gatesCount) elements.gatesCount.textContent = filtered.length;

  if (filtered.length === 0) {
    elements.allGatesList.innerHTML = '<p class="empty-message">No gates match your search</p>';
    return;
  }

  elements.allGatesList.innerHTML = filtered.map(gate => {
    const hasOverride = currentOverrides.gates?.hasOwnProperty(gate.name);
    const displayValue = hasOverride ? currentOverrides.gates[gate.name] : gate.value;

    return `
      <div class="all-item">
        <span class="all-item-name">${escapeHtml(gate.name)}</span>
        ${hasOverride ? '<span class="all-item-override">Override</span>' : ''}
        <span class="all-item-value ${displayValue}">${displayValue}</span>
        ${!hasOverride ? `<button class="all-item-add" data-gate="${escapeHtml(gate.name)}" data-value="${!gate.value}">Override</button>` : ''}
      </div>
    `;
  }).join('');

  // Add click handlers for override buttons
  elements.allGatesList.querySelectorAll('.all-item-add').forEach(btn => {
    btn.addEventListener('click', async () => {
      const name = btn.dataset.gate;
      const value = btn.dataset.value === 'true';
      await addGateOverrideFromAll(name, value);
    });
  });
}

function renderAllExperiments(filter = '') {
  if (!elements.allExperimentsList) return;

  if (!allStatsigValues?.experiments) {
    elements.allExperimentsList.innerHTML = '<p class="empty-message">No experiments found (Statsig not initialized?)</p>';
    if (elements.experimentsCount) elements.experimentsCount.textContent = '0';
    return;
  }

  const filtered = allStatsigValues.experiments
    .filter(e => e.name.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (elements.experimentsCount) elements.experimentsCount.textContent = filtered.length;

  if (filtered.length === 0) {
    elements.allExperimentsList.innerHTML = '<p class="empty-message">No experiments match your search</p>';
    return;
  }

  elements.allExperimentsList.innerHTML = filtered.map(exp => {
    const hasOverride = currentOverrides.experiments?.hasOwnProperty(exp.name);
    const valueKeys = exp.value ? Object.keys(exp.value).slice(0, 3) : [];
    const hasMoreKeys = exp.value && Object.keys(exp.value).length > 3;

    return `
      <div class="all-item">
        <span class="all-item-name">${escapeHtml(exp.name)}</span>
        ${hasOverride ? '<span class="all-item-override">Override</span>' : ''}
        <div class="all-experiment-values">
          ${valueKeys.map(key => `<span class="all-experiment-value">${escapeHtml(key)}</span>`).join('')}
          ${hasMoreKeys ? '<span class="all-experiment-value">...</span>' : ''}
        </div>
      </div>
    `;
  }).join('');
}

async function addGateOverrideFromAll(gateName, gateValue) {
  currentOverrides.gates[gateName] = gateValue;

  // Update both views
  renderGates();
  renderAllGates(elements.searchAll?.value || '');
  showStatus('success', `Gate "${gateName}" set to ${gateValue}`);

  try {
    await saveOverrides();
  } catch (error) {
    // Revert on error
    delete currentOverrides.gates[gateName];
    renderGates();
    renderAllGates(elements.searchAll?.value || '');
  }
}

// ============================================
// Utilities
// ============================================

function showStatus(type, message) {
  elements.status.textContent = message;
  elements.status.className = `status ${type}`;

  // Auto-hide success messages
  if (type === 'success') {
    setTimeout(clearStatus, 3000);
  }
}

function clearStatus() {
  elements.status.className = 'status';
  elements.status.textContent = '';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function parseValue(str) {
  // Try to parse as JSON (handles booleans, numbers, arrays, objects)
  try {
    return JSON.parse(str);
  } catch {
    // Return as string if not valid JSON
    return str;
  }
}

function formatValue(value) {
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
