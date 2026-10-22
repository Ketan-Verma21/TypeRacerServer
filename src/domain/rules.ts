// Pure questions about a game. Used by modes, services and tests.
import type { Game, Player } from "./types";

export const isFinished = (game: Game, player: Player): boolean =>
    game.words.length > 0 && player.wordIndex >= game.words.length;

/** Players actually racing (spectators excluded). */
export const racersOf = (game: Game): Player[] => game.players.filter((p) => !p.isSpectator);

/** Racers still typing: not finished, not eliminated. */
export const activeRacers = (game: Game): Player[] =>
    racersOf(game).filter((p) => !p.isEliminated && !isFinished(game, p));

export const findPlayer = (game: Game, playerId: string): Player | undefined =>
    game.players.find((p) => p.id === playerId);

/** Who becomes host when the host leaves: first racer, else anyone. */
export const nextHost = (game: Game): Player | undefined => racersOf(game)[0] ?? game.players[0];

/**
 * Final standings: players still in the race first, finished before
 * unfinished, then higher WPM first.
 */
export function rankPlayers(game: Game): Player[] {
    return [...racersOf(game)].sort((a, b) => {
        if (a.isEliminated !== b.isEliminated) return a.isEliminated ? 1 : -1;
        const af = isFinished(game, a);
        const bf = isFinished(game, b);
        if (af !== bf) return af ? -1 : 1;
        return b.wpm - a.wpm;
    });
}
