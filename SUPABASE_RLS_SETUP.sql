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

-- Los usuarios pueden ver solo su propio perfil
CREATE POLICY "Profiles: user puede ver su propio perfil" 
ON public.profiles FOR SELECT 
USING (auth.uid() = id);

-- Los admins pueden ver todos (usando la función segura que definimos arriba)
CREATE POLICY "Profiles: admin puede ver todos los perfiles" 
ON public.profiles FOR SELECT 
USING ( public.has_role(ARRAY['admin']) );

-- Permitir que el sistema inserte el perfil durante el registro
CREATE POLICY "Profiles: sistema puede insertar" 
ON public.profiles FOR INSERT 
WITH CHECK (true);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 5. ASEGURAR PERMISOS
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON TABLE public.profiles TO postgres, service_role;
GRANT SELECT ON TABLE public.profiles TO authenticated;
