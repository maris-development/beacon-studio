<script lang="ts">
    import { onDestroy } from "svelte";
    import type { AuthRole } from "@maris-development/beacon-client";
    import EyeIcon from "@lucide/svelte/icons/eye";
    import EyeOffIcon from "@lucide/svelte/icons/eye-off";
    import KeyRoundIcon from "@lucide/svelte/icons/key-round";
    import UserPlusIcon from "@lucide/svelte/icons/user-plus";
    import Modal from "@/components/modals/Modal.svelte";
    import Button from "@/components/buttons/Button.svelte";
    import { Input } from "@/components/ui/input";
    import { Label } from "@/components/ui/label";
    import { Checkbox } from "@/components/ui/checkbox";
    import type { BeaconNode } from "@/beacon-api/types";
    import { adminErrorMessage, withAdmin } from "@/services/admin-session";
    import { createUserWithRoles, stepFailureToast } from "@/access/actions";
    import { isValidName } from "@/access/names";
    import { generatePassword, maskSecret } from "@/access/password";
    import { ruleCount } from "@/access/summary";
    import { addToast } from "@/stores/toasts";
    import { message, t, type Message } from "@/i18n";

    type Props = {
        node: BeaconNode;
        roles: AuthRole[];
        // The names of the users that exist on the node.
        usernames: string[];
        onClose: () => void;
        onSaved: () => void;
    };

    let { node, roles, usernames, onClose, onSaved }: Props = $props();

    let username = $state("");
    let password = $state("");
    let shown = $state(false);
    let picked: string[] = $state([]);
    // Field errors show only after the first Save click.
    let attempted = $state(false);
    // The raw server text of a failed save.
    let failure = $state("");
    let busy = $state(false);

    let nameError: Message | null = $derived.by(() => {
        if (!attempted) return null;
        const name = username.trim();
        if (name === "") return message("usersRoles.error.nameRequired");
        if (!isValidName(name)) return message("usersRoles.error.nameInvalid");
        // The server answers a duplicate with a plain 400, so the loaded list decides first.
        if (usernames.includes(name)) return message("usersRoles.error.exists");
        return null;
    });

    let passwordError: Message | null = $derived.by(() => {
        if (attempted && password === "") return message("usersRoles.error.passwordRequired");
        return null;
    });

    onDestroy(() => {
        password = "";
    });

    function toggleRole(name: string, checked: boolean) {
        if (checked) {
            picked = [...picked, name];
        } else {
            picked = picked.filter((item) => item !== name);
        }
    }

    function generate() {
        password = generatePassword();
        shown = true;
    }

    async function save() {
        attempted = true;
        failure = "";
        if (nameError || passwordError) return;

        busy = true;
        const name = username.trim();
        const secret = password;
        // The order of the list, not the order of the clicks.
        const chosen = roles.filter((role) => picked.includes(role.name)).map((role) => role.name);

        try {
            const failures = await withAdmin(node, (client) =>
                createUserWithRoles(client.admin, name, secret, chosen)
            );
            // A null result means the user cancelled the sign-in.
            if (failures === null) return;

            if (failures.length > 0) {
                addToast(stepFailureToast(failures, adminErrorMessage));
            } else {
                addToast({
                    type: "success",
                    key: "usersRoles.newUserDialog.created",
                    values: { user: name }
                });
            }
            onSaved();
        } catch (caught) {
            // The SDK sends the password as a SQL literal, so a server error can echo it.
            failure = maskSecret(adminErrorMessage(caught), secret);
        } finally {
            busy = false;
        }
    }
</script>

<Modal
    title={$t("usersRoles.newUserDialog.title")}
    subtitle={$t("usersRoles.newUserDialog.subtitle", { node: node.name })}
    {onClose}
    canCloseModal={!busy}
    width="560px"
>
    <div class="form">
        <div class="field">
            <Label for="new-user-name">
                {$t("usersRoles.newUserDialog.username")}<span class="required" aria-hidden="true"
                    >*</span
                >
            </Label>
            <Input
                id="new-user-name"
                bind:value={username}
                required
                autocomplete="off"
                spellcheck="false"
                aria-invalid={nameError !== null}
                placeholder={$t("usersRoles.newUserDialog.usernamePlaceholder")}
            />
            <span class="hint">{$t("usersRoles.nameHint")}</span>
            {#if nameError}
                <p class="error" role="alert">{$t(nameError)}</p>
            {/if}
        </div>

        <div class="field">
            <Label for="new-user-password">
                {$t("usersRoles.newUserDialog.password")}<span class="required" aria-hidden="true"
                    >*</span
                >
            </Label>
            <div class="row">
                <Input
                    id="new-user-password"
                    type={shown ? "text" : "password"}
                    bind:value={password}
                    required
                    autocomplete="new-password"
                    spellcheck="false"
                    aria-invalid={passwordError !== null}
                />
                <Button
                    variant="outline"
                    size="icon"
                    aria-label={shown
                        ? $t("usersRoles.newUserDialog.hidePassword")
                        : $t("usersRoles.newUserDialog.showPassword")}
                    title={shown
                        ? $t("usersRoles.newUserDialog.hidePassword")
                        : $t("usersRoles.newUserDialog.showPassword")}
                    onclick={() => (shown = !shown)}
                >
                    {#if shown}
                        <EyeOffIcon />
                    {:else}
                        <EyeIcon />
                    {/if}
                </Button>
                <Button variant="outline" onclick={generate}>
                    <KeyRoundIcon />
                    {$t("usersRoles.newUserDialog.generate")}
                </Button>
            </div>
            <span class="hint">{$t("usersRoles.newUserDialog.passwordHint")}</span>
            {#if passwordError}
                <p class="error" role="alert">{$t(passwordError)}</p>
            {/if}
        </div>

        <fieldset class="field">
            <legend>{$t("usersRoles.newUserDialog.roles")}</legend>
            {#if roles.length === 0}
                <span class="hint">{$t("usersRoles.newUserDialog.noRoles")}</span>
            {:else}
                <ul class="roles">
                    {#each roles as role (role.name)}
                        <li>
                            <label class="role">
                                <Checkbox
                                    checked={picked.includes(role.name)}
                                    onCheckedChange={(checked) => toggleRole(role.name, checked)}
                                />
                                <span class="name">{role.name}</span>
                                <span class="count"
                                    >{$t("usersRoles.ruleCount", { count: ruleCount(role) })}</span
                                >
                            </label>
                        </li>
                    {/each}
                </ul>
            {/if}
        </fieldset>

        {#if failure}
            <p class="error" role="alert">{failure}</p>
        {/if}
    </div>

    <div slot="footer" class="actions">
        <Button variant="outline" onclick={onClose} disabled={busy}>{$t("common.cancel")}</Button>
        <Button onclick={save} disabled={busy}>
            <UserPlusIcon />
            {$t("usersRoles.newUserDialog.create")}
        </Button>
    </div>
</Modal>

<style lang="scss">
    .form {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .field {
        display: grid;
        align-content: start;
        gap: 0.375rem;
        margin: 0;
        padding: 0;
        border: 0;
    }

    legend {
        margin-bottom: 0.375rem;
        font-weight: 500;
    }

    .required {
        margin-left: 0.125rem;
        color: var(--destructive);
    }

    .row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .roles {
        max-height: 14rem;
        margin: 0;
        padding: 0;
        overflow-y: auto;
        border: 1px solid var(--border);
        border-radius: calc(var(--radius) - 2px);
        list-style: none;

        li + li {
            border-top: 1px solid var(--border);
        }
    }

    .role {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.625rem 0.75rem;
        cursor: pointer;

        .name {
            font-weight: 500;
        }

        .count {
            margin-left: auto;
            color: var(--muted-foreground);
            font-size: var(--font-size-sm);
        }
    }

    .hint {
        color: var(--muted-foreground);
        font-size: var(--font-size-sm);
    }

    .error {
        margin: 0;
        color: var(--destructive);
        font-size: var(--font-size-sm);
    }

    .actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
    }
</style>
