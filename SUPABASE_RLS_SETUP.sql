  -- 0. ASEGURAR COLUMNAS
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text;

  -- 1. FUNCIÓN DE ROLES ACTUALIZADA (Sin recursión)
  -- Usamos CREATE OR REPLACE para no romper las dependencias de las tablas existentes
  CREATE OR REPLACE FUNCTION public.has_role(target_roles text[])
  RETURNS boolean AS $$
  DECLARE
    user_role text;
  BEGIN
    -- Al ser SECURITY DEFINER, esta consulta ignora las políticas RLS de la tabla profiles,
    -- evitando el bucle infinito (recursión).
    SELECT role INTO user_role FROM public.profiles WHERE id = auth.uid();
    RETURN user_role = ANY(target_roles);
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

  -- 2. FUNCIÓN DE PERFIL ULTRA-ROBUSTA
  -- Esta función se encarga de crear la entrada en 'profiles' cuando alguien se registra
  CREATE OR REPLACE FUNCTION public.create_default_profile()
  RETURNS trigger AS $$
  BEGIN
    -- Generamos un username único usando los primeros 8 caracteres del ID del usuario.
    -- Esto evita errores de "username duplicado" que bloquean el registro.
    INSERT INTO public.profiles (id, role, email, username)
    VALUES (
      new.id, 
      'user', 
      new.email, 
      'user_' || substr(md5(new.id::text), 1, 8)
    )
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

    RETURN new;
  EXCEPTION WHEN OTHERS THEN
    -- PLAN B: Si algo falla (por ejemplo, la tabla profiles está bloqueada),
    -- permitimos que el usuario se cree en la tabla de Auth.
    -- Es mejor un usuario sin perfil que un error de registro.
    RETURN new;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

  -- 3. RE-VINCULAR EL TRIGGER
  DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.create_default_profile();

  -- 4. REPARAR POLÍTICAS DE PERFILES
  -- Desactivamos y reactivamos RLS para limpiar cualquier estado inconsistente
  ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "Profiles: user puede ver su propio perfil" ON public.profiles;
  DROP POLICY IF EXISTS "Profiles: admin puede ver todos los perfiles" ON public.profiles;
  DROP POLICY IF EXISTS "Profiles: usuario puede crear su propio perfil" ON public.profiles;

  -- Permite que cualquier usuario autenticado vea su propio perfil y que administradores vean todos
  DROP POLICY IF EXISTS "Profiles: ver perfil propio" ON public.profiles;
  CREATE POLICY "Profiles: ver perfiles" 
  ON public.profiles FOR SELECT 
  USING (auth.uid() = id OR public.has_role(ARRAY['admin', 'manager']));

  -- Permite búsqueda de email por username (necesario para el login por username)
  -- Solo permite ver columnas básicas para no exponer datos sensibles
  DROP POLICY IF EXISTS "Profiles: busqueda publica de username" ON public.profiles;
  CREATE POLICY "Profiles: busqueda publica de username" 
  ON public.profiles FOR SELECT 
  TO anon, authenticated
  USING (true);

  -- Los admins pueden ver todos (usando la función segura que definimos arriba)
  CREATE POLICY "Profiles: admin puede ver todos los perfiles" 
  ON public.profiles FOR SELECT 
  USING ( public.has_role(ARRAY['admin']) );

  -- Permitir que el sistema inserte el perfil durante el registro
  -- Esta es la política clave para el registro: permite que el trigger inserte el perfil inicial
  DROP POLICY IF EXISTS "Profiles: sistema puede insertar" ON public.profiles;
  CREATE POLICY "Profiles: sistema puede insertar" 
  ON public.profiles FOR INSERT 
  WITH CHECK ( (select auth.uid()) = id OR (select auth.uid()) IS NULL );

  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

  -- 5. ASEGURAR PERMISOS
  GRANT USAGE ON SCHEMA public TO anon, authenticated;
  GRANT ALL ON TABLE public.profiles TO postgres, service_role;
  GRANT SELECT ON TABLE public.profiles TO authenticated;

  -- ==========================================
  -- COMANDO PARA ASIGNARTE EL ROL (REMPLAZA EL EMAIL)
  -- ==========================================
  -- Cambia 'tu-correo@ejemplo.com' por tu email real antes de darle RUN
  
  UPDATE public.profiles 
  SET role = 'admin' 
  WHERE email = 'tu-correo@ejemplo.com';

  -- ==========================================
  -- COMANDO PARA DARTE ACCESO (REMPLAZA EL EMAIL)
  -- ==========================================
  -- Ejecuta esta línea cada vez que quieras subir de rango a alguien:
  
  UPDATE public.profiles 
  SET role = 'admin' 
  WHERE email = 'tu-correo@ejemplo.com'; -- <--- CAMBIA ESTO
