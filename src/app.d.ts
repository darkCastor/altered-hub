// src/app.d.ts
declare global {
  namespace App {
    interface Locals {
      user: {
        id: string;
        username: string;
      } | null;
    }
    // interface PageData {}
    // interface Error {}
    // interface Platform {}
  }
}

export {};
