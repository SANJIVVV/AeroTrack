import { describe, expect, it } from 'vitest';
import { html, raw, escapeHtml, cx, formValues } from '../js/lib/dom.js';

describe('html template', () => {
  it('escapes interpolated text', () => {
    const name = '<img src=x onerror=alert(1)>';
    expect(String(html`<p>${name}</p>`)).toBe('<p>&lt;img src=x onerror=alert(1)&gt;</p>');
  });

  it('escapes quotes so attribute values cannot break out', () => {
    expect(String(html`<a title="${'" onclick="x'}">`)).toBe('<a title="&quot; onclick=&quot;x">');
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('keeps nested html and raw() markup, joins arrays and drops empty values', () => {
    const items = ['a', 'b'].map((x) => html`<li>${x}</li>`);
    expect(String(html`<ul>${items}</ul>${null}${undefined}${false}${raw('<hr>')}`)).toBe('<ul><li>a</li><li>b</li></ul><hr>');
  });

  it('renders numbers, including zero', () => {
    expect(String(html`${0} bags`)).toBe('0 bags');
  });
});

describe('helpers', () => {
  it('cx joins truthy class names', () => {
    expect(cx('a', false, 'b', null, '')).toBe('a b');
  });

  it('formValues reads named fields', () => {
    const form = document.createElement('form');
    form.innerHTML = '<input name="email" value="a@b.c"><select name="role"><option value="staff" selected>Staff</option></select>';
    expect(formValues(form)).toEqual({ email: 'a@b.c', role: 'staff' });
  });
});
