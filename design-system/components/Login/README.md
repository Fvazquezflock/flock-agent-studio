Pantalla de ingreso: panel de marca con el isologo y el claim, y formulario con SSO.

## Cuándo usarlo
- Entrada a cualquier sistema interno. Es una composición de componentes, no un componente del bundle.

## Cómo se arma
- Panel izquierdo sobre `brand-night` con los brillos radiales del sitio (`brand-purple-deep` y `brand-orange`), logo blanco y claim en `display-lg`.
- Panel derecho: `Button` `brand` para SSO, `Divider` con texto, `FormField` + `TextInput`, `Checkbox`, `Button` primario `block`.

## Reglas
- SSO primero; usuario y contraseña como alternativa. Mensajes de error genéricos ("El mail o la contraseña no coinciden").
- Bajo 820px el panel de marca pasa arriba.
