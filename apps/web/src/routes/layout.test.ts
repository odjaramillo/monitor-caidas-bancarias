import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Layout from './+layout.svelte';
import { prerender } from './+layout.js';

describe('root layout', () => {
  it('prerenders every page, because adapter-static serves only files', () => {
    expect(prerender).toBe(true);
  });

  it('renders the page content and links the favicon', () => {
    const children = createRawSnippet(() => ({ render: () => '<p>page content</p>' }));

    // The root route has no params and no load function, so both stay empty.
    const { body, head } = render(Layout, { props: { children, params: {}, data: {} } });

    expect(body).toContain('<p>page content</p>');
    expect(head).toMatch(/<link rel="icon" href="[^"]+"/);
  });
});
