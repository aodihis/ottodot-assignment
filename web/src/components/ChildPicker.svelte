<script lang="ts">
  import type { Child } from '../lib/types';

  let {
    children,
    selected = $bindable<string[]>([]),
    disabled = false,
  }: { children: Child[]; selected?: string[]; disabled?: boolean } = $props();

  function toggle(id: string, checked: boolean) {
    selected = checked ? [...selected, id] : selected.filter((childId) => childId !== id);
  }
</script>

<!-- One order covers every checked child, which is the shape the API takes. -->
<ul class="child-picker">
  {#each children as child (child.id)}
    <li>
      <label>
        <input
          type="checkbox"
          value={child.id}
          checked={selected.includes(child.id)}
          {disabled}
          onchange={(event) => toggle(child.id, event.currentTarget.checked)}
        />
        {child.name}
      </label>
    </li>
  {/each}
</ul>
