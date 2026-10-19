<script lang="ts">
    import type { AuthRole, AuthUser } from "@maris-development/beacon-client";
    import { t } from "@/i18n";
    import { publicAccess, totals } from "@/access/summary";

    let { users, roles }: { users: AuthUser[]; roles: AuthRole[] } = $props();

    let sums = $derived(totals(users, roles));
    let publicValue = $derived(publicAccess(users, roles));
</script>

<section class="cards">
    <div class="cell">
        <span class="label">{$t("usersRoles.cards.users")}</span>
        <strong class="value">{sums.users}</strong>
        <span class="line">{$t("usersRoles.cards.usersLine", { count: sums.localUsers })}</span>
    </div>
    <div class="cell">
        <span class="label">{$t("usersRoles.cards.roles")}</span>
        <strong class="value">{sums.roles}</strong>
        <span class="line">
            {#if sums.roles === 0}
                {$t("usersRoles.cards.rolesEmpty")}
            {:else}
                {$t("usersRoles.cards.rolesLine", { count: sums.usersWithRole })}
            {/if}
        </span>
    </div>
    <div class="cell">
        <span class="label">{$t("usersRoles.cards.rules")}</span>
        <strong class="value">{sums.grants + sums.denies}</strong>
        <span class="line">
            {$t("usersRoles.cards.rulesLine", { grants: sums.grants, denies: sums.denies })}
        </span>
    </div>
    <div class="cell">
        <span class="label">{$t("usersRoles.cards.public")}</span>
        <strong class="value">{$t(publicValue)}</strong>
        <span class="line">{$t("usersRoles.cards.publicLine")}</span>
    </div>
</section>

<style lang="scss">
    .cards {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        margin-bottom: 1rem;
        border: 1px solid var(--border);
        border-radius: 0.75rem;
        background: var(--card);
    }

    .cell {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        min-width: 0;
        padding: 1rem;
        border-left: 1px solid var(--border);

        &:first-child {
            border-left: 0;
        }
    }

    .label,
    .line {
        color: var(--muted-foreground);
        font-size: var(--font-size-sm);
    }

    .value {
        font-size: var(--font-size-xl);
        font-weight: 700;
    }

    @media (max-width: 900px) {
        .cards {
            grid-template-columns: repeat(2, 1fr);
        }

        .cell:nth-child(odd) {
            border-left: 0;
        }

        .cell:nth-child(n + 3) {
            border-top: 1px solid var(--border);
        }
    }

    @media (max-width: 480px) {
        .cards {
            grid-template-columns: 1fr;
        }

        .cell {
            border-left: 0;

            &:nth-child(n + 2) {
                border-top: 1px solid var(--border);
            }
        }
    }
</style>
