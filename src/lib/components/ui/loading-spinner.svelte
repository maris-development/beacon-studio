<script lang="ts">
  import { cn } from '$lib/utils';

  /**
   * Props definition
   */
  export let className: string = '';
  export let ringColor: string | null = 'gray';
  export let ringSegmentColor: string | null = 'black';
  export let size: number | string | null = 16;

  // Compute the spinner border style reactively
  let borderStyle = cn(
    'border-4 rounded-full animate-spin myspinner',
  );

  // Compute the spinner size style reactively
  let sizeStyle = `h-${size} w-${size}`;
</script>

<style>
.myspinner {
  border-color: var(--ring-color, #e5e7eb) transparent;
  border-top-color: var(--ring-segment-color, #000);
}
</style>


<div class={cn(sizeStyle, className)} {...$$restProps}>
  <div class={cn(borderStyle, sizeStyle)} style="--ring-color: {ringColor}; --ring-segment-color: {ringSegmentColor}"></div>
</div>
