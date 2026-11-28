# Keep Canvas and HTML adapters behind a shared application session

MHK10 needs both an immediate-mode pixel desktop and independently usable, searchable HTML pages. We retain both renderers and public routes, while sharing typed application sessions, document operations and lifecycle rules; replacing the desktop with a component framework would change interaction and rendering constraints without resolving those rules. React95 source images are converted once into shared Canvas/SVG assets, so the icon change does not require React in the runtime.

Legacy storage keys and host-specific About routes stay compatible. Renaming them with the visible brand would otherwise strand existing documents and links. Disposal stays separate from saving because automatic teardown must not bypass a document's refusal to close.
