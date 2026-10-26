<script lang="ts">
    /**
     * The one dialog that answers `askSignIn`. The layout holds a single instance.
     */
    import Button from "@/components/buttons/Button.svelte";
    import Modal from "@/components/modals/Modal.svelte";
    import { Input } from "@/components/ui/input";
    import { Label } from "@/components/ui/label";
    import LogInIcon from "@lucide/svelte/icons/log-in";
    import { t } from "@/i18n";
    import {
        AdminAuthError,
        adminErrorMessage,
        answerSignIn,
        canRememberSignIn,
        signIn,
        signInRequest
    } from "@/services/admin-session";
    import { Checkbox } from "$lib/components/ui/checkbox/index.js";
    import { addToast } from "@/stores/toasts";

    const rememberAvailable = canRememberSignIn();

    let username = $state("");
    let password = $state("");
    let remember = $state(false);
    let error = $state("");
    let busy = $state(false);

    // A new request starts with an empty form.
    $effect(() => {
        if (!$signInRequest) return;

        username = "";
        password = "";
        remember = false;
        error = "";
        busy = false;
    });

    // A running sign-in cannot stop, so a cancel then would still sign in.
    function cancel() {
        if (busy) return;

        answerSignIn(false);
    }

    // Escape closes this dialog only, not the modal that started the action.
    $effect(() => {
        if (!$signInRequest) return;

        const onKeydown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;

            event.preventDefault();
            event.stopImmediatePropagation();
            cancel();
        };

        document.addEventListener("keydown", onKeydown, true);

        return () => document.removeEventListener("keydown", onKeydown, true);
    });

    async function submit(event: SubmitEvent) {
        event.preventDefault();

        const request = $signInRequest;
        if (!request || busy) return;

        busy = true;
        error = "";

        try {
            const saved = await signIn(request.node, username, password, remember);

            if (!saved) {
                addToast({ type: "warning", key: "admin.signIn.rememberFailed" });
            }

            answerSignIn(true, request);
        } catch (caught) {
            if (caught instanceof AdminAuthError) {
                error = caught.message;
            } else {
                error = adminErrorMessage(caught);
            }
        } finally {
            busy = false;
        }
    }
</script>

{#if $signInRequest}
    <div class="sign-in-layer">
        <Modal
            title={$t("admin.signIn.title")}
            subtitle={$t("admin.signIn.subtitle", {
                name: $signInRequest.node.name,
                url: $signInRequest.node.url
            })}
            onClose={cancel}
            width="440px"
        >
            <form id="admin-sign-in" onsubmit={submit}>
                <div class="field">
                    <Label for="admin-username">{$t("admin.signIn.username")}</Label>
                    <Input
                        id="admin-username"
                        autocomplete="username"
                        placeholder={$t("admin.signIn.usernamePlaceholder")}
                        bind:value={username}
                        required
                    />
                </div>

                <div class="field">
                    <Label for="admin-password">{$t("admin.signIn.password")}</Label>
                    <Input
                        id="admin-password"
                        type="password"
                        autocomplete="current-password"
                        bind:value={password}
                        required
                    />
                </div>

                {#if rememberAvailable}
                    <p class="help">{$t("admin.signIn.helpRemember")}</p>
                {:else}
                    <p class="help">{$t("admin.signIn.help")}</p>
                {/if}

                {#if rememberAvailable}
                    <div class="remember">
                        <Checkbox
                            id="admin-remember"
                            checked={remember}
                            onCheckedChange={(value) => (remember = value === true)}
                        />
                        <Label for="admin-remember">{$t("admin.signIn.remember")}</Label>
                    </div>
                    <p class="help">{$t("admin.signIn.rememberNote")}</p>
                {/if}

                {#if error}
                    <p class="error" role="alert">{error}</p>
                {/if}
            </form>

            <div slot="footer" class="actions">
                <Button variant="outline" onclick={cancel} disabled={busy}
                    >{$t("common.cancel")}</Button
                >
                <Button type="submit" form="admin-sign-in" disabled={busy}>
                    <LogInIcon />
                    {#if busy}
                        {$t("admin.signIn.busy")}
                    {:else}
                        {$t("admin.signIn.submit")}
                    {/if}
                </Button>
            </div>
        </Modal>
    </div>
{/if}

<style lang="scss">
    // Same layer as `Confirm`: above the modal that started the action.
    .sign-in-layer {
        position: relative;
        z-index: 60;
    }

    form {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    .field {
        display: grid;
        gap: 0.375rem;
    }

    .remember {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .help {
        margin: 0;
        font-size: var(--font-size-sm);
        color: var(--muted-foreground);
    }

    .error {
        margin: 0;
        color: var(--destructive);
    }

    .actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
    }
</style>
