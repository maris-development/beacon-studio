import maplibregl from 'maplibre-gl';
import EditQuery from './QueryControl.svelte';
import { mount } from 'svelte';

export class QueryControl implements maplibregl.IControl {
    private _container!: HTMLDivElement;
    private onEditClick: () => void;
    private onReRunClick: () => void;

    constructor({
        onEditClick = () => {},
        onReRunClick = () => {}
    }: {
        onEditClick?: () => void;
        onReRunClick?: () => void;
    }) {

        this.onEditClick = onEditClick.bind(this);
        this.onReRunClick = onReRunClick.bind(this);
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onAdd(_: maplibregl.Map) {
        this._container = document.createElement('div');  

        mount(EditQuery, {
            target: this._container,
            props: {
                onEditClick: this.onEditClick,
                onReRunClick: this.onReRunClick
            }
        });


        return this._container;
    }

    onRemove() {
        // destroy the Svelte component so it tears down its event listeners
        // remove from the map UI
        if (this._container.parentNode) {
            this._container.parentNode.removeChild(this._container);
        }
    }

    getDefaultPosition(): maplibregl.ControlPosition {
        return 'top-left';
    }


}
