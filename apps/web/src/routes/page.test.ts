import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Page from './+page.svelte';

// Smoke test: the home page renders on the server, as the static build does.
describe('home page', () => {
  it('renders the app title in the heading and in the document head', () => {
    const { body, head } = render(Page);

    expect(body).toContain('<h1>Monitor de caídas bancarias</h1>');
    expect(head).toContain('<title>Monitor de caídas bancarias</title>');
  });
});
