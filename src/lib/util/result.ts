
export function Ok<T>(value: T): Result<T, never> {
    return Result.Ok(value);
}

export function Err<E>(error: E): Result<never, E> {
    return Result.Err(error);
}

type ErrorInner<Err> = { ok: false; error: Err };
type OkInner<Ok> = { ok: true; value: Ok };
type Inner<Ok, Err> = OkInner<Ok> | ErrorInner<Err>;

export class Result<Ok, Err> {

    private constructor(private inner: Inner<Ok, Err>) {
    }

    static Ok<T>(value: T): Result<T, never> {
        return new Result({ ok: true, value });
    }

    static Err<E>(error: E): Result<never, E> {
        return new Result({ ok: false, error });
    }

    isOk(): this is Result<Ok, never> {
        return this.inner.ok;
    }

    isErr(): this is Result<never, Err> {
        return !this.inner.ok;
    }

    unwrap(): Ok {
        if (this.inner.ok) {
            return this.inner.value;
        }
        throw new Error("Tried to unwrap an Err value");
    }

    unwrapErr(): Err {
        if (!this.inner.ok) {
            return (this.inner as ErrorInner<Err>).error;
        }
        throw new Error("Tried to unwrapErr an Ok value");
    }

    map<NewOk>(fn: (value: Ok) => NewOk): Result<NewOk, Err> {
        if (this.inner.ok) {
            return Result.Ok(fn(this.inner.value));
        }
        return Result.Err((this.inner as ErrorInner<Err>).error);
    }

    mapErr<NewErr>(fn: (error: Err) => NewErr): Result<Ok, NewErr> {
        if (!this.inner.ok) {
            return Result.Err(fn((this.inner as ErrorInner<Err>).error));
        }
        return Result.Ok(this.inner.value);
    }
}