import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "node",
        include: ["tests/**/*.test.mjs"],
        restoreMocks: true, // undo vi.spyOn after every test
        coverage: {
            provider: "v8",
            include: ["services/**", "sockets/**", "utils/**", "api/**"],
            reporter: ["text", "html"],
        },
    },
});
