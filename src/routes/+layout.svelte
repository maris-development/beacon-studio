
<style lang="scss">

.nav-bar {
  background-color: #222;
  padding: 1rem;

  .nav-list {
    list-style: none;
    display: flex;
    gap: 1.5rem;
    margin: 0;
    padding: 0;

    .nav-item {
      a {
        color: #fff;
        text-decoration: none;
        font-weight: 500;

        &:hover {
          text-decoration: underline;
        }
      }
    }
  }
}


.main-content {
    flex-grow: 1;
    display: flex;
    flex-direction: column;
}

</style>


<nav class="nav-bar">
  <ul class="nav-list">
    <li class="nav-item"><a href="/">Home</a></li>
    <li class="nav-item"><a href="/map">Map</a></li>
    <li class="nav-item"><a href="/login">Login</a></li>
    <li class="nav-item"><a href="/table">Table</a></li>
  </ul>
</nav>

<main class="main-content">
  <!-- this is where the current page’s +page.svelte will render -->
  <slot />
</main>

