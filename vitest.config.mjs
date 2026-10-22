import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "node",
        include: ["tests/**/*.test.ts"],
        restoreMocks: true, // undo vi.spyOn after every test
        coverage: {
            provider: "v8",
            include: ["src/**/*.ts"],
            exclude: ["src/index.ts"],
            reporter: ["text", "html"],
        },
    },
});
