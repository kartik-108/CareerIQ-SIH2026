import { provider } from './provider.js';

export async function getHealth() {
  return provider.health();
}
