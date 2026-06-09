/* Shared UI primitives for Life OS tabs */
import { escapeHtml } from './api.js';

export function pageHeader({eyebrow='', title='', body='', actions=''}) {
  return `<div class="life-header life-page-header">
    <div>
      ${eyebrow ? `<div class="life-eyebrow">${escapeHtml(eyebrow)}</div>` : ''}
      <h2>${escapeHtml(title)}</h2>
      ${body ? `<p>${escapeHtml(body)}</p>` : ''}
    </div>
    ${actions ? `<div class="life-header-actions">${actions}</div>` : ''}
  </div>`;
}

export function section(title, body, opts={}) {
  return `<section class="life-section ${opts.className || ''}">
    <div class="life-section-head">
      <div><div class="life-section-title">${escapeHtml(title)}</div>${opts.subtitle ? `<p>${escapeHtml(opts.subtitle)}</p>` : ''}</div>
      ${opts.actions || ''}
    </div>
    ${body}
  </section>`;
}

export function emptyState(title, body='', action='') {
  return `<div class="life-empty">
    <div class="life-empty-orb">✦</div>
    <div class="life-empty-title">${escapeHtml(title)}</div>
    ${body ? `<p>${escapeHtml(body)}</p>` : ''}
    ${action ? `<div class="life-empty-action">${action}</div>` : ''}
  </div>`;
}

export function badge(text, variant='neutral') {
  return `<span class="life-badge life-badge-${variant}">${escapeHtml(text)}</span>`;
}

export function statusBadge(text, active=false) {
  return `<span class="life-status ${active ? 'is-active' : ''}"><i></i>${escapeHtml(text)}</span>`;
}

export function card(title, body, opts={}) {
  const icon = opts.icon ? `<span class="life-card-icon">${escapeHtml(opts.icon)}</span>` : '';
  const actions = opts.actions || '';
  const meta = opts.meta ? `<div class="life-card-meta-line">${opts.meta}</div>` : '';
  return `<article class="life-card ${opts.className || ''}">
    <header class="life-card-header"><div>${icon}<span class="life-card-title">${escapeHtml(title)}</span></div>${actions}</header>
    ${meta}
    <div class="life-card-body">${body}</div>
  </article>`;
}

export function stat(label, value, hint='', opts={}) {
  return `<div class="life-stat ${opts.className || ''}">
    <span class="life-stat-value">${escapeHtml(value)}</span>
    <span class="life-stat-label">${escapeHtml(label)}</span>
    ${hint ? `<small>${escapeHtml(hint)}</small>` : ''}
  </div>`;
}

export function metricRow(label, value, hint='') {
  return `<div class="life-metric-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${hint ? `<small>${escapeHtml(hint)}</small>` : ''}</div>`;
}

export function actionButton(label, onclick, opts={}) {
  const cls = opts.primary ? 'life-btn life-btn-primary' : 'life-btn';
  return `<button class="${cls} ${opts.className || ''}" onclick="${escapeHtml(onclick)}">${escapeHtml(label)}</button>`;
}

export function loading(text='Loading...') {
  return `<div class="life-loading"><span class="life-spinner"></span>${escapeHtml(text)}</div>`;
}

export function toolbar(inner) {
  return `<div class="life-toolbar">${inner}</div>`;
}

export function toast(msg) {
  const { showToast } = window.__lifeImports || {};
  if (showToast) showToast(msg);
}
