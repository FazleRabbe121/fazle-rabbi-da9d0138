import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  UtensilsCrossed,
  Plus,
  Search,
  Heart,
  Clock,
  Trash2,
  Edit2,
  Sparkles,
  BookOpen,
  Camera,
  Image as ImageIcon,
  Copy,
  Download,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  X,
  Wine,
  Coffee,
  Layers,
  Filter,
  Check,
  Wand2,
  Eye,
  FileText,
  PlusCircle,
} from 'lucide-react';
import { RecipeRecord, RecipeCategory } from '../types';
import { useTheme } from '../context/ThemeContext';

export interface RecipeIngredientItem {
  id: string;
  name: string;
  quantity: string;
  unit: string;
  preparation?: string;
  isOptional?: boolean;
  notes?: string;
  uncertain?: boolean;
}

export interface IntelligentRecipe {
  id: string;
  userId: string;
  name: string;
  category: string;
  recipeType: string;
  shortDescription: string;
  tags: string[];
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
  structuredIngredients: RecipeIngredientItem[];
  ingredientsText: string;
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  totalTimeMinutes: number;
  mixingMethod: string;
  preparationInstructions: string;
  preparationSteps: string[];
  servingInstructions: string;
  recommendedSequence: string;
  glassware: {
    glassName: string;
    glassType: string;
    glassCapacity: string;
    glassPreparation: string;
    iceType: string;
    iceQuantity: string;
    glassDecoration: string;
  };
  garnish: {
    garnishName: string;
    garnishIngredients: string;
    garnishPreparation: string;
    garnishTechnique: string;
    garnishPlacement: string;
    finalPresentation: string;
  };
  technical: {
    classification: string;
    cocktailCategory: string;
    alcoholBase: string;
    isAlcoholic: 'Alcoholic' | 'Non-Alcoholic' | 'Optional / Adaptable';
    flavorProfile: string;
    aroma: string;
    texture: string;
    sweetness: string;
    acidity: string;
    bitterness: string;
    color: string;
    abv: string;
    servingSize: string;
  };
  professionalNotes: {
    bartenderNotes: string;
    preparationTips: string;
    substitutionOptions: string;
    commonMistakes: string;
    servingTemperature: string;
    presentationNotes: string;
  };
  mainImage?: string;
  aiPresentationImage?: string;
  referenceImages: string[];
  extractedFromPhoto?: boolean;
  uncertainFields?: string[];
  aiSuggestedFields?: string[];
}

interface RecipeLibraryViewProps {
  recipes?: RecipeRecord[];
  onOpenAddModal?: () => void;
  onEditRecipe?: (recipe: RecipeRecord) => void;
  onDeleteRecipe?: (id: string) => Promise<void>;
  onToggleFavorite?: (recipe: RecipeRecord) => Promise<void>;
  onSyncLegacyRecipe?: (
    recordData: Omit<RecipeRecord, 'id' | 'userId' | 'createdAt'>,
    existingId?: string
  ) => Promise<void>;
}

const EMPTY_RECIPE_FORM: Omit<IntelligentRecipe, 'id' | 'userId' | 'createdAt' | 'updatedAt'> = {
  name: '',
  category: 'Signature Cocktails',
  recipeType: 'Cocktail',
  shortDescription: '',
  tags: [],
  isFavorite: false,
  structuredIngredients: [
    { id: 'ing-1', name: '', quantity: '45', unit: 'ml', preparation: '', isOptional: false, notes: '' },
    { id: 'ing-2', name: '', quantity: '25', unit: 'ml', preparation: '', isOptional: false, notes: '' },
  ],
  ingredientsText: '',
  prepTimeMinutes: 4,
  cookTimeMinutes: 0,
  totalTimeMinutes: 4,
  mixingMethod: 'Shaken & Double Strained',
  preparationInstructions: '',
  preparationSteps: [''],
  servingInstructions: '',
  recommendedSequence: 'Chill Glass -> Measure Syrup/Juice -> Measure Base -> Ice & Shake/Stir -> Strain -> Garnish',
  glassware: {
    glassName: 'Stemmed Crystal Coupe Glass',
    glassType: 'Coupe Glass',
    glassCapacity: '180 ml',
    glassPreparation: 'Chilled at -5°C',
    iceType: 'Cubed Ice (Shaken, Served Neat)',
    iceQuantity: 'Standard',
    glassDecoration: '',
  },
  garnish: {
    garnishName: '',
    garnishIngredients: '',
    garnishPreparation: '',
    garnishTechnique: '',
    garnishPlacement: 'On Rim',
    finalPresentation: '',
  },
  technical: {
    classification: 'Signature Creation',
    cocktailCategory: 'Signature Cocktails',
    alcoholBase: '', // Optional — not required for Mocktails/Coffee/Food
    isAlcoholic: 'Alcoholic',
    flavorProfile: '',
    aroma: '',
    texture: 'Silky & Balanced',
    sweetness: 'Balanced (3/5)',
    acidity: 'Crisp (3/5)',
    bitterness: 'Low (1/5)',
    color: 'Golden Amber',
    abv: '',
    servingSize: '140 ml',
  },
  professionalNotes: {
    bartenderNotes: '',
    preparationTips: '',
    substitutionOptions: '',
    commonMistakes: '',
    servingTemperature: '4°C',
    presentationNotes: '',
  },
  mainImage: undefined,
  aiPresentationImage: undefined,
  referenceImages: [],
  extractedFromPhoto: false,
  uncertainFields: [],
  aiSuggestedFields: [],
};

const GLASS_TYPES = [
  'Coupe Glass',
  'Martini Glass',
  'Highball Glass',
  'Rocks / Old Fashioned Glass',
  'Collins Glass',
  'Nick & Nora Glass',
  'Hurricane Glass',
  'Wine / Spritz Glass',
  'Tiki Mug',
  'Ceramic Latte / Coffee Cup',
  'Custom / Culinary Plate',
];

const MIXING_METHODS = [
  'Shaken & Double Strained',
  'Stirred over Crystal Ice',
  'Built in Glass',
  'Blended / Frozen',
  'Layered',
  'Muddled & Shaken',
  'Thrown / Aerated',
  'Cold Infused / Clarified',
  'Espresso Extracted / Brewed',
  'Culinary Plated',
];

export const RecipeLibraryView: React.FC<RecipeLibraryViewProps> = ({
  recipes: legacyFirestoreRecipes = [],
  onDeleteRecipe,
  onSyncLegacyRecipe,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // Persistent Recipe Book Database State
  const [dbRecipes, setDbRecipes] = useState<IntelligentRecipe[]>([]);
  const [categories, setCategories] = useState<string[]>([
    'Classic Cocktails',
    'Signature Cocktails',
    'Modern Cocktails',
    'Mocktails',
    'Coffee',
    'Tea',
    'Fresh Juices',
    'Smoothies',
    'Homemade Syrups',
    'Homemade Mixers',
    'Desserts',
    'Food Recipes',
    'Other Custom Recipes',
  ]);
  const [loading, setLoading] = useState<boolean>(true);
  const [banner, setBanner] = useState<{ type: 'success' | 'info' | 'warning' | 'error'; text: string } | null>(null);

  // Filters & Semantic Search State (Sections 9 & 11)
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedGlassFilter, setSelectedGlassFilter] = useState<string>('all');
  const [selectedAlcoholFilter, setSelectedAlcoholFilter] = useState<string>('all');
  const [multiIngredientFilter, setMultiIngredientFilter] = useState<string>('');
  const [onlyFavorites, setOnlyFavorites] = useState<boolean>(false);

  // Top Dedicated Recipe AI Assistant State (Sections 8 & 9)
  const [aiQueryInput, setAiQueryInput] = useState<string>('');
  const [aiAssistantBusy, setAiAssistantBusy] = useState<boolean>(false);
  const [aiAssistantResult, setAiAssistantResult] = useState<{
    query: string;
    hasSimilarSavedInBook: boolean;
    similarSavedNotice: string;
    existingSavedRecipes: Array<{ recipe: IntelligentRecipe; relevanceScore: number; matchedReasons: string[] }>;
    conversationalAnswer: string;
    aiSuggestedNewRecipe?: any;
    modifiedExistingRecipe?: any;
  } | null>(null);

  // Active Modal / Studio Modes
  const [viewingRecipe, setViewingRecipe] = useState<IntelligentRecipe | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [editorSectionTab, setEditorSectionTab] = useState<
    'basic' | 'ingredients' | 'prep' | 'glassware' | 'garnish' | 'technical' | 'notes' | 'images'
  >('basic');
  const [formState, setFormState] = useState<Omit<IntelligentRecipe, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>(
    EMPTY_RECIPE_FORM
  );
  const [tagsInput, setTagsInput] = useState<string>('');
  const [newCustomCategoryInput, setNewCustomCategoryInput] = useState<string>('');

  // Photo-to-Recipe AI OCR Extraction State (Section 7)
  const [isOcrModalOpen, setIsOcrModalOpen] = useState<boolean>(false);
  const [ocrImageDataUrl, setOcrImageDataUrl] = useState<string>('');
  const [ocrBusy, setOcrBusy] = useState<boolean>(false);
  const [ocrExtractionSummary, setOcrExtractionSummary] = useState<string>('');
  const ocrFileInputRef = useRef<HTMLInputElement | null>(null);

  // AI Presentation Image Generation State (Section 10)
  const [imageGenBusyId, setImageGenBusyId] = useState<string | null>(null);
  const mainImageUploadRef = useRef<HTMLInputElement | null>(null);
  const refImageUploadRef = useRef<HTMLInputElement | null>(null);

  // Load Persistent Recipe Book Database from Backend
  const loadRecipeBook = useCallback(async () => {
    try {
      const res = await fetch('/api/recipe-book/recipes');
      if (res.ok) {
        const data = await res.json();
        const serverRecipes: IntelligentRecipe[] = data.recipes || [];

        // Merge any legacy Firestore recipes that aren't in the server DB yet so zero user data is ever lost
        const existingIds = new Set(serverRecipes.map((r) => r.id));
        const convertedLegacy: IntelligentRecipe[] = legacyFirestoreRecipes
          .filter((lr) => !existingIds.has(lr.id))
          .map((lr) => ({
            ...EMPTY_RECIPE_FORM,
            id: lr.id,
            userId: lr.userId || 'default-user',
            name: lr.name,
            category: lr.category || 'Signature Cocktails',
            recipeType: lr.category || 'Cocktail',
            shortDescription: lr.notes || '',
            tags: lr.tags ? lr.tags.split(',').map((t) => t.trim()) : [],
            isFavorite: Boolean(lr.isFavorite),
            createdAt: lr.createdAt || new Date().toISOString(),
            updatedAt: lr.createdAt || new Date().toISOString(),
            structuredIngredients: (lr.ingredients || '')
              .split('\n')
              .filter(Boolean)
              .map((line, i) => ({
                id: `leg-${i}`,
                name: line.trim(),
                quantity: '',
                unit: '',
              })),
            ingredientsText: lr.ingredients || '',
            prepTimeMinutes: lr.prepTimeMinutes || 5,
            cookTimeMinutes: lr.cookTimeMinutes || 0,
            totalTimeMinutes: lr.totalTimeMinutes || 5,
            mixingMethod: lr.method || 'Crafted',
            preparationInstructions: lr.steps || '',
            preparationSteps: (lr.steps || '').split('\n').filter(Boolean),
            mainImage: lr.photoUrl,
            referenceImages: lr.photoUrl ? [lr.photoUrl] : [],
          }));

        setDbRecipes([...serverRecipes, ...convertedLegacy]);
        if (Array.isArray(data.categories) && data.categories.length > 0) {
          setCategories(data.categories);
        }
      }
    } catch (err: any) {
      setBanner({ type: 'warning', text: err?.message || 'Could not load Recipe Book.' });
    } finally {
      setLoading(false);
    }
  }, [legacyFirestoreRecipes]);

  useEffect(() => {
    void loadRecipeBook();
  }, [loadRecipeBook]);

  // Open Editor for New Recipe
  const handleOpenNewRecipe = () => {
    setEditingRecipeId(null);
    setFormState(EMPTY_RECIPE_FORM);
    setTagsInput('');
    setEditorSectionTab('basic');
    setIsEditorOpen(true);
  };

  // Open Editor for Existing Recipe
  const handleOpenEditRecipe = (recipe: IntelligentRecipe) => {
    setEditingRecipeId(recipe.id);
    setFormState({
      name: recipe.name,
      category: recipe.category,
      recipeType: recipe.recipeType || 'Cocktail',
      shortDescription: recipe.shortDescription || '',
      tags: recipe.tags || [],
      isFavorite: recipe.isFavorite,
      structuredIngredients:
        recipe.structuredIngredients?.length > 0
          ? recipe.structuredIngredients
          : [{ id: 'ing-1', name: recipe.ingredientsText || '', quantity: '', unit: '' }],
      ingredientsText: recipe.ingredientsText || '',
      prepTimeMinutes: recipe.prepTimeMinutes || 5,
      cookTimeMinutes: recipe.cookTimeMinutes || 0,
      totalTimeMinutes: recipe.totalTimeMinutes || 5,
      mixingMethod: recipe.mixingMethod || 'Shaken',
      preparationInstructions: recipe.preparationInstructions || '',
      preparationSteps: recipe.preparationSteps?.length > 0 ? recipe.preparationSteps : [''],
      servingInstructions: recipe.servingInstructions || '',
      recommendedSequence: recipe.recommendedSequence || '',
      glassware: { ...EMPTY_RECIPE_FORM.glassware, ...(recipe.glassware || {}) },
      garnish: { ...EMPTY_RECIPE_FORM.garnish, ...(recipe.garnish || {}) },
      technical: { ...EMPTY_RECIPE_FORM.technical, ...(recipe.technical || {}) },
      professionalNotes: { ...EMPTY_RECIPE_FORM.professionalNotes, ...(recipe.professionalNotes || {}) },
      mainImage: recipe.mainImage,
      aiPresentationImage: recipe.aiPresentationImage,
      referenceImages: recipe.referenceImages || [],
      extractedFromPhoto: recipe.extractedFromPhoto,
      uncertainFields: recipe.uncertainFields || [],
      aiSuggestedFields: recipe.aiSuggestedFields || [],
    });
    setTagsInput((recipe.tags || []).join(', '));
    setEditorSectionTab('basic');
    setIsEditorOpen(true);
  };

  // Duplicate Recipe
  const handleDuplicateRecipe = async (recipe: IntelligentRecipe) => {
    try {
      const res = await fetch('/api/recipe-book/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...recipe,
          id: undefined,
          name: `${recipe.name} (Copy)`,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setDbRecipes(data.recipes);
        setBanner({ type: 'success', text: `Duplicated "${recipe.name}".` });
      }
    } catch {
      setBanner({ type: 'error', text: 'Could not duplicate recipe.' });
    }
  };

  // Save Recipe from Structured Editor
  const handleSaveRecipeForm = async () => {
    if (!formState.name.trim()) {
      setBanner({ type: 'warning', text: 'Please enter a Recipe Name.' });
      return;
    }

    const formattedIngredientsText = formState.structuredIngredients
      .filter((i) => i.name.trim())
      .map((i) => `${i.quantity} ${i.unit} ${i.name}${i.preparation ? ` (${i.preparation})` : ''}`.trim())
      .join('\n');

    const payload = {
      ...formState,
      id: editingRecipeId || undefined,
      tags: tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      ingredientsText: formattedIngredientsText,
      totalTimeMinutes: Number(formState.prepTimeMinutes || 0) + Number(formState.cookTimeMinutes || 0),
    };

    try {
      const res = await fetch('/api/recipe-book/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to save recipe');

      setDbRecipes(data.recipes);
      setIsEditorOpen(false);
      setBanner({
        type: 'success',
        text: `Saved "${ data.recipe.name }" permanently to your Recipe Book.`,
      });

      // Also sync to Firestore legacy collection if callback provided
      if (onSyncLegacyRecipe) {
        const legacyCat: RecipeCategory =
          data.recipe.category.includes('Mocktail')
            ? 'Mocktail'
            : data.recipe.category.includes('Coffee')
            ? 'Coffee'
            : data.recipe.category.includes('Syrup')
            ? 'Syrup'
            : data.recipe.category.includes('Food') || data.recipe.category.includes('Dessert')
            ? 'Food'
            : 'Cocktail';

        await onSyncLegacyRecipe(
          {
            name: data.recipe.name,
            category: legacyCat,
            ingredients: data.recipe.ingredientsText,
            prepTimeMinutes: data.recipe.prepTimeMinutes,
            cookTimeMinutes: data.recipe.cookTimeMinutes,
            totalTimeMinutes: data.recipe.totalTimeMinutes,
            method: data.recipe.mixingMethod,
            steps: data.recipe.preparationInstructions || data.recipe.preparationSteps.join('\n'),
            notes: data.recipe.shortDescription,
            tags: (data.recipe.tags || []).join(', '),
            isFavorite: data.recipe.isFavorite,
            photoUrl: data.recipe.mainImage,
          },
          editingRecipeId || undefined
        );
      }
    } catch (err: any) {
      setBanner({ type: 'error', text: err?.message || 'Could not save recipe.' });
    }
  };

  // Delete Recipe
  const handleDeleteRecipeItem = async (id: string) => {
    try {
      const res = await fetch(`/api/recipe-book/recipes/${id}`, { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        setDbRecipes(data.recipes);
        if (viewingRecipe?.id === id) setViewingRecipe(null);
      }
      if (onDeleteRecipe) {
        await onDeleteRecipe(id);
      }
      setBanner({ type: 'info', text: 'Recipe removed from Recipe Book.' });
    } catch {
      setBanner({ type: 'error', text: 'Failed to delete recipe.' });
    }
  };

  // Toggle Favorite
  const handleToggleFav = async (recipe: IntelligentRecipe) => {
    try {
      const res = await fetch('/api/recipe-book/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...recipe,
          isFavorite: !recipe.isFavorite,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setDbRecipes(data.recipes);
      }
    } catch {
      // ignore
    }
  };

  // Add Custom Category
  const handleCreateCustomCategory = async () => {
    if (!newCustomCategoryInput.trim()) return;
    try {
      const res = await fetch('/api/recipe-book/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: newCustomCategoryInput.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories);
        setFormState((prev) => ({ ...prev, category: newCustomCategoryInput.trim() }));
        setNewCustomCategoryInput('');
      }
    } catch {
      // ignore
    }
  };

  // ============================================================================
  // SECTION 8 & 9: DEDICATED RECIPE AI ASSISTANT & PERSONAL RECIPE MEMORY
  // ============================================================================

  const handleAskRecipeAssistant = async (overrideQuery?: string) => {
    const q = (overrideQuery !== undefined ? overrideQuery : aiQueryInput).trim();
    if (!q) return;
    if (overrideQuery !== undefined) setAiQueryInput(overrideQuery);

    setAiAssistantBusy(true);
    try {
      const res = await fetch('/api/recipe-book/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'AI Assistant error');
      setAiAssistantResult(data);
    } catch (err: any) {
      setBanner({ type: 'error', text: err?.message || 'Recipe AI Assistant failed.' });
    } finally {
      setAiAssistantBusy(false);
    }
  };

  const handleLoadSuggestedIntoEditor = (suggested: any) => {
    if (!suggested) return;
    setEditingRecipeId(null);
    setFormState({
      ...EMPTY_RECIPE_FORM,
      name: suggested.name || 'AI Suggested Recipe',
      category: suggested.category || 'Signature Cocktails',
      recipeType: suggested.recipeType || 'Cocktail',
      shortDescription: suggested.shortDescription || suggested.modificationSummary || '',
      structuredIngredients:
        Array.isArray(suggested.structuredIngredients) && suggested.structuredIngredients.length > 0
          ? suggested.structuredIngredients
          : EMPTY_RECIPE_FORM.structuredIngredients,
      prepTimeMinutes: suggested.prepTimeMinutes || 4,
      mixingMethod: suggested.mixingMethod || 'Shaken',
      preparationInstructions: suggested.preparationInstructions || '',
      preparationSteps: Array.isArray(suggested.preparationSteps) ? suggested.preparationSteps : [''],
      servingInstructions: suggested.servingInstructions || '',
      glassware: { ...EMPTY_RECIPE_FORM.glassware, ...(suggested.glassware || {}) },
      garnish: { ...EMPTY_RECIPE_FORM.garnish, ...(suggested.garnish || {}) },
      technical: { ...EMPTY_RECIPE_FORM.technical, ...(suggested.technical || {}) },
      professionalNotes: { ...EMPTY_RECIPE_FORM.professionalNotes, ...(suggested.professionalNotes || {}) },
    });
    setTagsInput('ai-crafted, signature');
    setEditorSectionTab('basic');
    setIsEditorOpen(true);
  };

  // ============================================================================
  // SECTION 7: PHOTO-TO-RECIPE VISION OCR EXTRACTION
  // ============================================================================

  const handleUploadOcrPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setOcrImageDataUrl(reader.result);
        setIsOcrModalOpen(true);
        void runPhotoExtraction(reader.result, false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const runPhotoExtraction = async (imageDataUrl: string, generateMissingSuggestions: boolean) => {
    setOcrBusy(true);
    try {
      const res = await fetch('/api/recipe-book/extract-from-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageDataUrl,
          generateMissingSuggestions,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Photo extraction failed');

      const ex = data.extractedRecipe || {};
      setOcrExtractionSummary(ex.extractionSummary || 'Extracted structured fields from uploaded image.');
      setEditingRecipeId(null);
      setFormState({
        ...EMPTY_RECIPE_FORM,
        name: ex.name || 'Extracted Recipe from Photo',
        category: ex.category || 'Signature Cocktails',
        recipeType: ex.recipeType || 'Cocktail',
        shortDescription: ex.shortDescription || '',
        structuredIngredients:
          Array.isArray(ex.structuredIngredients) && ex.structuredIngredients.length > 0
            ? ex.structuredIngredients
            : EMPTY_RECIPE_FORM.structuredIngredients,
        prepTimeMinutes: Number(ex.prepTimeMinutes) || 5,
        mixingMethod: ex.mixingMethod || 'Shaken',
        preparationInstructions: ex.preparationInstructions || '',
        preparationSteps: Array.isArray(ex.preparationSteps) ? ex.preparationSteps : [''],
        servingInstructions: ex.servingInstructions || '',
        glassware: { ...EMPTY_RECIPE_FORM.glassware, ...(ex.glassware || {}) },
        garnish: { ...EMPTY_RECIPE_FORM.garnish, ...(ex.garnish || {}) },
        technical: { ...EMPTY_RECIPE_FORM.technical, ...(ex.technical || {}) },
        professionalNotes: { ...EMPTY_RECIPE_FORM.professionalNotes, ...(ex.professionalNotes || {}) },
        referenceImages: [imageDataUrl],
        extractedFromPhoto: true,
        uncertainFields: Array.isArray(ex.uncertainFields) ? ex.uncertainFields : [],
        aiSuggestedFields: Array.isArray(ex.aiSuggestedFields) ? ex.aiSuggestedFields : [],
      });
      setTagsInput('photo-extracted');
    } catch (err: any) {
      setBanner({ type: 'error', text: err?.message || 'Failed to extract recipe from image.' });
    } finally {
      setOcrBusy(false);
    }
  };

  // ============================================================================
  // SECTION 10: AI PRESENTATION IMAGE GENERATION (GLASSWARE + GARNISH ACCURATE)
  // ============================================================================

  const handleGeneratePresentationImage = async (recipe?: IntelligentRecipe, setAsMain = true) => {
    const targetId = recipe?.id || editingRecipeId || 'draft';
    setImageGenBusyId(targetId);
    try {
      const res = await fetch('/api/recipe-book/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipeId: recipe?.id || editingRecipeId,
          recipeData: recipe || formState,
          setAsMainImage: setAsMain,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to generate image');

      if (!recipe) {
        // Inside the editor
        setFormState((prev) => ({
          ...prev,
          aiPresentationImage: data.imageUrl,
          mainImage: setAsMain || !prev.mainImage ? data.imageUrl : prev.mainImage,
        }));
      } else {
        await loadRecipeBook();
        if (viewingRecipe && viewingRecipe.id === recipe.id) {
          setViewingRecipe((prev) =>
            prev
              ? {
                  ...prev,
                  aiPresentationImage: data.imageUrl,
                  mainImage: setAsMain ? data.imageUrl : prev.mainImage,
                }
              : null
          );
        }
      }

      setBanner({
        type: 'success',
        text: `Generated presentation image matching ${
          (recipe || formState).glassware?.glassType || 'specified glassware'
        } & ${(recipe || formState).garnish?.garnishName || 'garnish'}.`,
      });
    } catch (err: any) {
      setBanner({ type: 'error', text: err?.message || 'Could not generate recipe image.' });
    } finally {
      setImageGenBusyId(null);
    }
  };

  // Export Recipe as JSON / Markdown
  const handleExportRecipe = (recipe: IntelligentRecipe) => {
    const blob = new Blob([JSON.stringify(recipe, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${recipe.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-recipe.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Semantic & Multi-Criteria Filtering of Recipe Library
  const filteredRecipes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    // Multilingual semantic synonyms for Mango / Citrus / Coffee
    const querySynonyms = new Set<string>(q ? [q] : []);
    if (q.includes('mango') || q.includes('ম্যাংগো') || q.includes('আম')) {
      querySynonyms.add('mango');
      querySynonyms.add('alphonso');
      querySynonyms.add('ম্যাংগো');
    }
    if (q.includes('orange') || q.includes('citrus') || q.includes('লেবু') || q.includes('কমলা')) {
      querySynonyms.add('orange');
      querySynonyms.add('lime');
      querySynonyms.add('lemon');
      querySynonyms.add('cointreau');
    }

    const multiIngs = multiIngredientFilter
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    return dbRecipes.filter((r) => {
      if (selectedCategory !== 'all' && r.category !== selectedCategory) return false;
      if (
        selectedGlassFilter !== 'all' &&
        !r.glassware?.glassType?.toLowerCase().includes(selectedGlassFilter.toLowerCase())
      ) {
        return false;
      }
      if (selectedAlcoholFilter !== 'all' && r.technical?.isAlcoholic !== selectedAlcoholFilter) {
        return false;
      }
      if (onlyFavorites && !r.isFavorite) return false;

      const fullHaystack = `${r.name} ${r.category} ${r.shortDescription} ${r.ingredientsText} ${r.structuredIngredients
        .map((i) => `${i.name} ${i.notes || ''}`)
        .join(' ')} ${r.glassware?.glassName || ''} ${r.glassware?.glassType || ''} ${r.garnish?.garnishName || ''} ${
        r.technical?.flavorProfile || ''
      } ${(r.tags || []).join(' ')}`.toLowerCase();

      if (multiIngs.length > 0 && !multiIngs.every((ing) => fullHaystack.includes(ing))) {
        return false;
      }

      if (querySynonyms.size > 0) {
        return Array.from(querySynonyms).some((syn) => fullHaystack.includes(syn));
      }

      return true;
    });
  }, [
    dbRecipes,
    searchQuery,
    selectedCategory,
    selectedGlassFilter,
    selectedAlcoholFilter,
    multiIngredientFilter,
    onlyFavorites,
  ]);

  return (
    <div className="space-y-6 pb-16 animate-fade-in">
      {/* Hidden Input for Photo-to-Recipe OCR Upload */}
      <input
        ref={ocrFileInputRef}
        type="file"
        accept="image/*"
        onChange={handleUploadOcrPhoto}
        className="hidden"
      />

      {/* =====================================================================
          HEADER BAR: INTELLIGENT RECIPE BOOK
         ===================================================================== */}
      <div
        className={`p-5 sm:p-6 rounded-3xl border flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 ${
          isDark
            ? 'bg-gradient-to-r from-[#12151e] via-[#161b28] to-[#12151e] border-[#d4af37]/30'
            : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase font-bold tracking-widest text-[#d4af37] px-2.5 py-0.5 rounded-full bg-[#d4af37]/15 border border-[#d4af37]/30">
              Hospitality & Culinary Knowledge System
            </span>
            <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
              {dbRecipes.length} Saved Recipes • Persistent Vault
            </span>
          </div>
          <h1
            className={`text-2xl sm:text-3xl font-extrabold tracking-tight mt-1.5 ${
              isDark ? 'text-[#fdf8f0]' : 'text-slate-900'
            }`}
          >
            Recipe Book
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Structured cocktail, mocktail, specialty coffee, syrup & culinary vault with Personal Recipe Memory, Photo-to-Recipe OCR, and AI Presentation Photography.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => ocrFileInputRef.current?.click()}
            className={`px-4 py-2.5 rounded-2xl border text-xs font-bold transition flex items-center gap-2 ${
              isDark
                ? 'bg-slate-900 border-slate-700 text-slate-200 hover:border-[#d4af37]'
                : 'bg-slate-100 border-slate-200 text-slate-800 hover:bg-slate-200'
            }`}
          >
            <Camera className="w-4 h-4 text-[#d4af37]" />
            <span>Photo to Recipe (AI OCR)</span>
          </button>

          <button
            type="button"
            onClick={handleOpenNewRecipe}
            className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-[#d4af37] via-[#ffd700] to-[#c5a059] text-[#0b0c10] font-extrabold text-xs tracking-wider uppercase shadow-lg shadow-amber-950/30 hover:opacity-95 transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Recipe</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {banner && (
        <div
          className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 text-xs font-semibold ${
            banner.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-300'
              : banner.type === 'error'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-300'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{banner.text}</span>
          </div>
          <button type="button" onClick={() => setBanner(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* =====================================================================
          SECTION 8 & 9: TOP DEDICATED RECIPE AI ASSISTANT & MEMORY SEARCH
         ===================================================================== */}
      <div
        className={`p-5 sm:p-6 rounded-3xl border ${
          isDark ? 'bg-[#121623] border-indigo-500/30 shadow-lg' : 'bg-indigo-50/40 border-indigo-200 shadow-xs'
        }`}
      >
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-indigo-600 text-white flex items-center justify-center shadow-sm">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                AI Recipe Assistant & Personal Recipe Memory (বাংলা & English)
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Searches your saved Recipe Book first before suggesting new creations or variations.
              </p>
            </div>
          </div>
        </div>

        {/* Natural Language Search Bar */}
        <div className="flex flex-col sm:flex-row gap-2.5">
          <input
            type="text"
            value={aiQueryInput}
            onChange={(e) => setAiQueryInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleAskRecipeAssistant();
            }}
            placeholder='Ask in Bengali or English: e.g. "আমি ম্যাংগো দিয়ে একটি নতুন ককটেল বানাতে চাই" or "Show me all my recipes containing mango"...'
            className={`flex-1 px-4 py-3 rounded-2xl border text-xs sm:text-sm focus:outline-none focus:border-[#d4af37] ${
              isDark ? 'bg-[#0b0e17] border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
            }`}
          />
          <button
            type="button"
            disabled={aiAssistantBusy || !aiQueryInput.trim()}
            onClick={() => void handleAskRecipeAssistant()}
            className="px-6 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 shrink-0 shadow-md"
          >
            {aiAssistantBusy ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Searching Recipe Book...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Ask Recipe AI</span>
              </>
            )}
          </button>
        </div>

        {/* Quick Example Chips in Bengali & English */}
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          {[
            'আমি ম্যাংগো দিয়ে একটি নতুন ককটেল বানাতে চাই।',
            'আমার Recipe Book-এ ম্যাংগো দিয়ে আগে কোন কোন ককটেল বানিয়েছি?',
            'Show me all my recipes containing orange',
            'Which of my recipes uses a Martini Glass or Coupe Glass?',
          ].map((sample, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => void handleAskRecipeAssistant(sample)}
              className={`px-3 py-1 rounded-xl text-[11px] font-medium border transition ${
                isDark
                  ? 'bg-slate-900/90 border-slate-800 text-slate-300 hover:border-[#d4af37]/50 hover:text-white'
                  : 'bg-white border-slate-200 text-slate-700 hover:border-indigo-400'
              }`}
            >
              {sample}
            </button>
          ))}
        </div>

        {/* AI Assistant Structured Output: 1. Existing Saved Recipes, 2. AI-Suggested New Recipe, 3. Modified Variation */}
        {aiAssistantResult && (
          <div className="mt-5 pt-5 border-t border-slate-200 dark:border-slate-800 space-y-4">
            {/* Personal Recipe Memory Notice */}
            <div
              className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                aiAssistantResult.hasSimilarSavedInBook
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                  : 'bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-300'
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-bold">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{aiAssistantResult.similarSavedNotice}</span>
              </div>
              <button
                type="button"
                onClick={() => setAiAssistantResult(null)}
                className="text-xs opacity-75 hover:opacity-100 self-end sm:self-auto"
              >
                Close Assistant Panel
              </button>
            </div>

            {/* Conversational Answer */}
            <div
              className={`p-4 rounded-2xl border text-xs sm:text-sm leading-relaxed whitespace-pre-line ${
                isDark ? 'bg-[#0b0e17] border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
              }`}
            >
              {aiAssistantResult.conversationalAnswer}
            </div>

            {/* Three Clearly Separated Columns: Saved in Book vs AI New Suggestion vs Modified Variation */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Column 1: Existing Saved Recipe(s) */}
              <div
                className={`p-4 rounded-2xl border flex flex-col justify-between ${
                  isDark ? 'bg-[#0b0e17] border-emerald-500/40' : 'bg-white border-emerald-300'
                }`}
              >
                <div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    1. Existing Saved Recipe in Book ({aiAssistantResult.existingSavedRecipes.length})
                  </span>
                  {aiAssistantResult.existingSavedRecipes.length > 0 ? (
                    <div className="mt-3 space-y-3">
                      {aiAssistantResult.existingSavedRecipes.map(({ recipe, matchedReasons }) => (
                        <div
                          key={recipe.id}
                          className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1.5"
                        >
                          <div className="text-sm font-bold text-white">{recipe.name}</div>
                          <div className="text-[11px] text-slate-400">
                            {recipe.category} • {recipe.glassware?.glassType} • {recipe.technical?.isAlcoholic}
                          </div>
                          <div className="text-[10px] text-emerald-400">
                            Matched: {matchedReasons.join(' · ')}
                          </div>
                          <div className="pt-2 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setViewingRecipe(recipe)}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold"
                            >
                              Open Saved Recipe
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEditRecipe(recipe)}
                              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold"
                            >
                              Edit
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 mt-3">
                      No matching recipe is currently saved in your Recipe Book.
                    </p>
                  )}
                </div>
              </div>

              {/* Column 2: AI-Suggested Brand-New Recipe */}
              {aiAssistantResult.aiSuggestedNewRecipe && (
                <div
                  className={`p-4 rounded-2xl border flex flex-col justify-between ${
                    isDark ? 'bg-[#0b0e17] border-indigo-500/40' : 'bg-white border-indigo-300'
                  }`}
                >
                  <div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                      2. AI-Suggested New Recipe
                    </span>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-2.5">
                      {aiAssistantResult.aiSuggestedNewRecipe.name}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      {aiAssistantResult.aiSuggestedNewRecipe.shortDescription}
                    </p>
                    <div className="mt-2.5 text-[11px] text-slate-300 space-y-1 font-mono">
                      {(aiAssistantResult.aiSuggestedNewRecipe.structuredIngredients || []).map(
                        (ing: any, idx: number) => (
                          <div key={idx}>
                            • {ing.quantity} {ing.unit} {ing.name}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleLoadSuggestedIntoEditor(aiAssistantResult.aiSuggestedNewRecipe)}
                    className="mt-4 w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
                  >
                    Review & Save New Recipe to Book
                  </button>
                </div>
              )}

              {/* Column 3: Modified Version of Existing Recipe */}
              {aiAssistantResult.modifiedExistingRecipe && (
                <div
                  className={`p-4 rounded-2xl border flex flex-col justify-between ${
                    isDark ? 'bg-[#0b0e17] border-amber-500/40' : 'bg-white border-amber-300'
                  }`}
                >
                  <div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      3. Modified Version of Existing Recipe
                    </span>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-2.5">
                      {aiAssistantResult.modifiedExistingRecipe.name}
                    </h3>
                    {aiAssistantResult.modifiedExistingRecipe.basedOnRecipeName && (
                      <div className="text-[11px] text-amber-400 mt-0.5">
                        Based on your saved: {aiAssistantResult.modifiedExistingRecipe.basedOnRecipeName}
                      </div>
                    )}
                    <p className="text-xs text-slate-400 mt-1">
                      {aiAssistantResult.modifiedExistingRecipe.modificationSummary ||
                        aiAssistantResult.modifiedExistingRecipe.shortDescription}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleLoadSuggestedIntoEditor(aiAssistantResult.modifiedExistingRecipe)}
                    className="mt-4 w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold"
                  >
                    Open Variation in Editor & Save
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* =====================================================================
          SECTION 11: ADVANCED FILTERS & SEARCH BAR
         ===================================================================== */}
      <div
        className={`p-4 rounded-2xl border space-y-3 ${
          isDark ? 'bg-[#12151e] border-[#202534]' : 'bg-white border-slate-200 shadow-xs'
        }`}
      >
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
              selectedCategory === 'all'
                ? 'bg-[#d4af37] text-[#0b0c10]'
                : isDark
                ? 'bg-[#0b0d13] border border-[#232838] text-slate-400 hover:text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            All Categories ({dbRecipes.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                selectedCategory === cat
                  ? 'bg-[#d4af37] text-[#0b0c10] font-bold'
                  : isDark
                  ? 'bg-[#0b0d13] border border-[#232838] text-slate-400 hover:text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Multi-Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, mango / ম্যাংগো, citrus..."
              className={`w-full pl-8 pr-3 py-2 rounded-xl border text-xs focus:outline-none focus:border-[#d4af37] ${
                isDark ? 'bg-[#0b0d13] border-[#232838] text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
              }`}
            />
          </div>

          <input
            type="text"
            value={multiIngredientFilter}
            onChange={(e) => setMultiIngredientFilter(e.target.value)}
            placeholder="Multi-ingredients (e.g. mango, lime)"
            className={`px-3 py-2 rounded-xl border text-xs focus:outline-none focus:border-[#d4af37] ${
              isDark ? 'bg-[#0b0d13] border-[#232838] text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
            }`}
          />

          <select
            value={selectedGlassFilter}
            onChange={(e) => setSelectedGlassFilter(e.target.value)}
            className={`px-3 py-2 rounded-xl border text-xs ${
              isDark ? 'bg-[#0b0d13] border-[#232838] text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
            }`}
          >
            <option value="all">All Glassware Types</option>
            {GLASS_TYPES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>

          <select
            value={selectedAlcoholFilter}
            onChange={(e) => setSelectedAlcoholFilter(e.target.value)}
            className={`px-3 py-2 rounded-xl border text-xs ${
              isDark ? 'bg-[#0b0d13] border-[#232838] text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
            }`}
          >
            <option value="all">Alcoholic & Non-Alcoholic</option>
            <option value="Alcoholic">Alcoholic Only</option>
            <option value="Non-Alcoholic">Non-Alcoholic / Zero-Proof</option>
            <option value="Optional / Adaptable">Adaptable</option>
          </select>

          <button
            type="button"
            onClick={() => setOnlyFavorites((prev) => !prev)}
            className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition ${
              onlyFavorites
                ? 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                : isDark
                ? 'bg-[#0b0d13] border-[#232838] text-slate-400 hover:text-white'
                : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${onlyFavorites ? 'fill-current' : ''}`} />
            <span>Favorites Only</span>
          </button>
        </div>
      </div>

      {/* =====================================================================
          RECIPE LIBRARY CARDS GRID
         ===================================================================== */}
      {loading ? (
        <div className="py-16 text-center">
          <RefreshCw className="w-8 h-8 text-[#d4af37] animate-spin mx-auto mb-2" />
          <p className="text-xs text-slate-400">Loading your persistent Recipe Book...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredRecipes.map((recipe) => {
            const displayImage = recipe.mainImage || recipe.aiPresentationImage;
            const isGeneratingImg = imageGenBusyId === recipe.id;

            return (
              <div
                key={recipe.id}
                className={`group rounded-3xl border overflow-hidden transition-all duration-300 flex flex-col justify-between ${
                  isDark
                    ? 'bg-[#12151e] border-[#202534] hover:border-[#d4af37]/50 shadow-lg'
                    : 'bg-white border-slate-200 hover:border-amber-400 shadow-sm'
                }`}
              >
                {/* Recipe Visual Presentation Header */}
                <div
                  onClick={() => setViewingRecipe(recipe)}
                  className="relative h-52 w-full bg-[#0b0d13] overflow-hidden cursor-pointer"
                >
                  {displayImage ? (
                    <img
                      src={displayImage}
                      alt={recipe.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-600">
                      <UtensilsCrossed className="w-10 h-10 opacity-40" />
                    </div>
                  )}

                  {/* Top Badges */}
                  <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5">
                    <span className="px-2.5 py-1 rounded-xl bg-black/75 backdrop-blur-md border border-white/10 text-[10px] uppercase font-bold tracking-wider text-[#ffd700]">
                      {recipe.category}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-bold backdrop-blur-md ${
                        recipe.technical?.isAlcoholic === 'Non-Alcoholic'
                          ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
                          : 'bg-slate-900/80 text-slate-200 border border-white/10'
                      }`}
                    >
                      {recipe.technical?.isAlcoholic || 'Alcoholic'}
                    </span>
                  </div>

                  {/* Favorite Heart Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleToggleFav(recipe);
                    }}
                    className={`absolute top-3 right-3 p-2 rounded-xl backdrop-blur-md border transition ${
                      recipe.isFavorite
                        ? 'bg-rose-950/85 border-rose-500/60 text-rose-400'
                        : 'bg-black/60 border-white/10 text-white/75 hover:text-white'
                    }`}
                  >
                    <Heart className={`w-4 h-4 ${recipe.isFavorite ? 'fill-current' : ''}`} />
                  </button>

                  {/* Bottom Glassware & Prep Time Overlay */}
                  <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between text-[11px] text-white/90 bg-black/65 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10">
                    <span className="truncate font-semibold">{recipe.glassware?.glassType || 'Coupe Glass'}</span>
                    <span className="flex items-center gap-1 shrink-0 text-[#ffd700]">
                      <Clock className="w-3 h-3" />
                      {recipe.totalTimeMinutes || recipe.prepTimeMinutes}m
                    </span>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div>
                    <h3
                      onClick={() => setViewingRecipe(recipe)}
                      className={`text-base font-bold cursor-pointer hover:text-[#d4af37] transition line-clamp-1 ${
                        isDark ? 'text-[#fdf8f0]' : 'text-slate-900'
                      }`}
                    >
                      {recipe.name}
                    </h3>
                    <p className="text-xs text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                      {recipe.shortDescription || recipe.preparationInstructions}
                    </p>

                    {/* Main Ingredients Pills */}
                    <div className="flex flex-wrap gap-1 mt-3">
                      {recipe.structuredIngredients.slice(0, 4).map((ing) => (
                        <span
                          key={ing.id}
                          className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${
                            isDark ? 'bg-[#1a1f2e] text-slate-300' : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {ing.name}
                        </span>
                      ))}
                      {recipe.structuredIngredients.length > 4 && (
                        <span className="text-[10px] px-1.5 py-0.5 text-slate-400">
                          +{recipe.structuredIngredients.length - 4} more
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Actions Footer */}
                  <div className="pt-3 border-t border-slate-200 dark:border-[#1f2434] flex items-center justify-between gap-1">
                    <button
                      type="button"
                      onClick={() => setViewingRecipe(recipe)}
                      className="inline-flex items-center gap-1.5 text-xs text-[#d4af37] font-bold hover:underline"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Open Recipe</span>
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={isGeneratingImg}
                        onClick={() => void handleGeneratePresentationImage(recipe, true)}
                        className="p-1.5 text-slate-400 hover:text-amber-400 rounded-lg hover:bg-slate-800/50 transition"
                        title="Regenerate AI Presentation Image"
                      >
                        <Wand2 className={`w-3.5 h-3.5 ${isGeneratingImg ? 'animate-spin text-amber-400' : ''}`} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenEditRecipe(recipe)}
                        className="p-1.5 text-slate-400 hover:text-blue-400 rounded-lg hover:bg-slate-800/50 transition"
                        title="Edit Recipe"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDuplicateRecipe(recipe)}
                        className="p-1.5 text-slate-400 hover:text-emerald-400 rounded-lg hover:bg-slate-800/50 transition"
                        title="Duplicate Recipe"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExportRecipe(recipe)}
                        className="p-1.5 text-slate-400 hover:text-indigo-400 rounded-lg hover:bg-slate-800/50 transition"
                        title="Export Recipe JSON"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteRecipeItem(recipe.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800/50 transition"
                        title="Delete Recipe"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* =====================================================================
          FULL STRUCTURED RECIPE DETAIL VIEWER MODAL
         ===================================================================== */}
      {viewingRecipe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
          <div className="relative w-full max-w-4xl bg-[#11141d] border border-[#d4af37]/40 rounded-3xl p-6 sm:p-8 shadow-2xl text-slate-100 my-6 max-h-[92vh] overflow-y-auto space-y-6">
            {/* Top Modal Header */}
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-[#d4af37]/20 text-[#ffd700] border border-[#d4af37]/40">
                    {viewingRecipe.category}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300">
                    {viewingRecipe.technical?.isAlcoholic}
                  </span>
                  {viewingRecipe.technical?.abv && (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-slate-800 text-amber-300">
                      {viewingRecipe.technical.abv}
                    </span>
                  )}
                </div>
                <h2 className="text-2xl font-extrabold text-white mt-2">{viewingRecipe.name}</h2>
                <p className="text-xs text-slate-400 mt-1">{viewingRecipe.shortDescription}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const r = viewingRecipe;
                    setViewingRecipe(null);
                    handleOpenEditRecipe(r);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Edit Recipe</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewingRecipe(null)}
                  className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Presentation Image & Glassware / Garnish Highlights */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="h-72 rounded-2xl overflow-hidden border border-slate-800 bg-black relative">
                  <img
                    src={viewingRecipe.mainImage || viewingRecipe.aiPresentationImage}
                    alt={viewingRecipe.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-400">
                    Glass: <strong className="text-white">{viewingRecipe.glassware?.glassName}</strong>
                  </span>
                  <button
                    type="button"
                    disabled={imageGenBusyId === viewingRecipe.id}
                    onClick={() => void handleGeneratePresentationImage(viewingRecipe, true)}
                    className="px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold flex items-center gap-1.5 hover:bg-amber-500/30"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    <span>
                      {imageGenBusyId === viewingRecipe.id ? 'Generating...' : 'Regenerate AI Presentation Image'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Structured Ingredients Table */}
              <div className="p-5 rounded-2xl bg-[#0b0d13] border border-slate-800 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#ffd700]">
                  B. Structured Ingredients & Quantities
                </h3>
                <div className="divide-y divide-slate-800/80 text-xs">
                  {viewingRecipe.structuredIngredients.map((ing) => (
                    <div key={ing.id} className="py-2 flex items-center justify-between gap-2">
                      <div>
                        <span className="font-bold text-white">{ing.name}</span>
                        {ing.preparation && <span className="text-slate-400"> ({ing.preparation})</span>}
                        {ing.isOptional && (
                          <span className="ml-1.5 px-1.5 py-0.2 rounded bg-slate-800 text-[10px] text-amber-300">
                            Optional
                          </span>
                        )}
                      </div>
                      <span className="font-mono font-bold text-[#ffd700] shrink-0">
                        {ing.quantity} {ing.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* C. Preparation Steps & Sequence */}
            <div className="p-5 rounded-2xl bg-[#0b0d13] border border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#ffd700]">
                  C. Preparation Method ({viewingRecipe.mixingMethod})
                </h3>
                <span className="text-xs text-slate-400 font-mono">{viewingRecipe.recommendedSequence}</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">{viewingRecipe.preparationInstructions}</p>
              {viewingRecipe.preparationSteps?.length > 0 && (
                <ol className="list-decimal list-inside space-y-1.5 text-xs text-slate-200 pt-1">
                  {viewingRecipe.preparationSteps.filter(Boolean).map((step, idx) => (
                    <li key={idx}>{step}</li>
                  ))}
                </ol>
              )}
            </div>

            {/* D. Glassware, E. Garnish, F. Technical, G. Professional Notes Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-2xl bg-[#0b0d13] border border-slate-800 space-y-1.5">
                <h4 className="font-bold uppercase tracking-wider text-[#ffd700]">D. Glassware & Ice</h4>
                <div>
                  <span className="text-slate-400">Glass:</span> {viewingRecipe.glassware?.glassName} (
                  {viewingRecipe.glassware?.glassCapacity})
                </div>
                <div>
                  <span className="text-slate-400">Preparation:</span> {viewingRecipe.glassware?.glassPreparation}
                </div>
                <div>
                  <span className="text-slate-400">Ice:</span> {viewingRecipe.glassware?.iceType} (
                  {viewingRecipe.glassware?.iceQuantity})
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#0b0d13] border border-slate-800 space-y-1.5">
                <h4 className="font-bold uppercase tracking-wider text-[#ffd700]">E. Garnish & Presentation</h4>
                <div>
                  <span className="text-slate-400">Garnish:</span> {viewingRecipe.garnish?.garnishName}
                </div>
                <div>
                  <span className="text-slate-400">Placement:</span> {viewingRecipe.garnish?.garnishPlacement}
                </div>
                <div>
                  <span className="text-slate-400">Visual Look:</span> {viewingRecipe.garnish?.finalPresentation}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#0b0d13] border border-slate-800 space-y-1.5">
                <h4 className="font-bold uppercase tracking-wider text-[#ffd700]">F. Technical Sensory Profile</h4>
                <div>
                  <span className="text-slate-400">Flavor Profile:</span> {viewingRecipe.technical?.flavorProfile}
                </div>
                <div>
                  <span className="text-slate-400">Balance:</span> Sweetness: {viewingRecipe.technical?.sweetness} ·
                  Acidity: {viewingRecipe.technical?.acidity}
                </div>
                <div>
                  <span className="text-slate-400">Color & Size:</span> {viewingRecipe.technical?.color} (
                  {viewingRecipe.technical?.servingSize})
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#0b0d13] border border-slate-800 space-y-1.5">
                <h4 className="font-bold uppercase tracking-wider text-[#ffd700]">G. Professional Bartender Notes</h4>
                <div>
                  <span className="text-slate-400">Pro Tip:</span>{' '}
                  {viewingRecipe.professionalNotes?.bartenderNotes || viewingRecipe.professionalNotes?.preparationTips}
                </div>
                <div>
                  <span className="text-slate-400">Substitutions:</span>{' '}
                  {viewingRecipe.professionalNotes?.substitutionOptions}
                </div>
                <div>
                  <span className="text-slate-400">Serving Temp:</span>{' '}
                  {viewingRecipe.professionalNotes?.servingTemperature}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          SECTION 6, 7 & 10: 7-SECTION STRUCTURED RECIPE EDITOR STUDIO MODAL
         ===================================================================== */}
      {isEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
          <div className="relative w-full max-w-5xl bg-[#11141d] border border-[#d4af37]/40 rounded-3xl p-6 sm:p-8 shadow-2xl text-slate-100 my-6 max-h-[92vh] overflow-y-auto space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <h2 className="text-xl font-extrabold text-white">
                  {editingRecipeId ? `Edit Recipe: ${formState.name}` : 'Create Structured Hospitality Recipe'}
                </h2>
                <p className="text-xs text-slate-400">
                  Complete 7-Section Professional Recipe Specification & AI Presentation Image Studio
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditorOpen(false)}
                className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Uncertain OCR Fields Alert if extracted from photo */}
            {formState.uncertainFields && formState.uncertainFields.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs flex items-center justify-between gap-2">
                <span>
                  <strong>OCR Review Notice:</strong> Please verify these uncertain fields from the photo:{' '}
                  {formState.uncertainFields.join(', ')}
                </span>
                {formState.referenceImages[0] && (
                  <button
                    type="button"
                    onClick={() => void runPhotoExtraction(formState.referenceImages[0], true)}
                    className="px-3 py-1 rounded-lg bg-amber-500 text-slate-950 font-bold shrink-0"
                  >
                    Generate Missing Suggestions
                  </button>
                )}
              </div>
            )}

            {/* 7-Section Navigation Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar border-b border-slate-800">
              {[
                { id: 'basic', label: 'A. Basic Info' },
                { id: 'ingredients', label: 'B. Ingredients' },
                { id: 'prep', label: 'C. Preparation' },
                { id: 'glassware', label: 'D. Glassware & Ice' },
                { id: 'garnish', label: 'E. Garnish' },
                { id: 'technical', label: 'F. Technical Profile' },
                { id: 'notes', label: 'G. Pro Notes' },
                { id: 'images', label: 'H. Presentation Images' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setEditorSectionTab(t.id as any)}
                  className={`px-3.5 py-2 rounded-t-xl text-xs font-bold whitespace-nowrap transition ${
                    editorSectionTab === t.id
                      ? 'bg-[#d4af37] text-[#0b0c10]'
                      : 'bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* TAB A: BASIC RECIPE INFORMATION */}
            {editorSectionTab === 'basic' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block font-bold mb-1 text-slate-300">Recipe Name *</label>
                  <input
                    type="text"
                    value={formState.name}
                    onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                    placeholder="e.g. Golden Mango & Tajín Mezcal Margarita"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0b0d13] border border-slate-800 text-white"
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1 text-slate-300">Category</label>
                  <div className="flex gap-2">
                    <select
                      value={formState.category}
                      onChange={(e) => setFormState({ ...formState, category: e.target.value })}
                      className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#0b0d13] border border-slate-800 text-white"
                    >
                      {categories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-bold mb-1 text-slate-300">Create Custom Category (Optional)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newCustomCategoryInput}
                      onChange={(e) => setNewCustomCategoryInput(e.target.value)}
                      placeholder="New Category Name"
                      className="flex-1 px-3.5 py-2 rounded-xl bg-[#0b0d13] border border-slate-800 text-white"
                    />
                    <button
                      type="button"
                      onClick={() => void handleCreateCustomCategory()}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold"
                    >
                      + Add
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block font-bold mb-1 text-slate-300">
                    Recipe Tags (comma-separated, supports বাংলা & English)
                  </label>
                  <input
                    type="text"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    placeholder="mango, ম্যাংগো, tropical, signature, coupe"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0b0d13] border border-slate-800 text-white"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block font-bold mb-1 text-slate-300">Short Description</label>
                  <textarea
                    rows={3}
                    value={formState.shortDescription}
                    onChange={(e) => setFormState({ ...formState, shortDescription: e.target.value })}
                    placeholder="Concise hospitality description of flavors, inspiration, and balance..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0b0d13] border border-slate-800 text-white"
                  />
                </div>
              </div>
            )}

            {/* TAB B: STRUCTURED INGREDIENTS */}
            {editorSectionTab === 'ingredients' && (
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-300">
                    Structured Ingredients (Name, Quantity, Unit, Preparation & Notes)
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setFormState((prev) => ({
                        ...prev,
                        structuredIngredients: [
                          ...prev.structuredIngredients,
                          {
                            id: `ing-${Date.now()}`,
                            name: '',
                            quantity: '',
                            unit: 'ml',
                            preparation: '',
                            isOptional: false,
                          },
                        ],
                      }))
                    }
                    className="px-3.5 py-1.5 rounded-xl bg-[#d4af37] text-slate-950 font-bold"
                  >
                    + Add Ingredient Row
                  </button>
                </div>

                <div className="space-y-2">
                  {formState.structuredIngredients.map((ing, idx) => (
                    <div
                      key={ing.id}
                      className="grid grid-cols-1 sm:grid-cols-12 gap-2 p-3 rounded-xl bg-[#0b0d13] border border-slate-800 items-center"
                    >
                      <input
                        type="text"
                        value={ing.name}
                        onChange={(e) => {
                          const next = [...formState.structuredIngredients];
                          next[idx] = { ...next[idx], name: e.target.value };
                          setFormState({ ...formState, structuredIngredients: next });
                        }}
                        placeholder="Ingredient Name (e.g. Fresh Mango Puree)"
                        className="sm:col-span-4 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
                      />
                      <input
                        type="text"
                        value={ing.quantity}
                        onChange={(e) => {
                          const next = [...formState.structuredIngredients];
                          next[idx] = { ...next[idx], quantity: e.target.value };
                          setFormState({ ...formState, structuredIngredients: next });
                        }}
                        placeholder="Qty (45)"
                        className="sm:col-span-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono"
                      />
                      <input
                        type="text"
                        value={ing.unit}
                        onChange={(e) => {
                          const next = [...formState.structuredIngredients];
                          next[idx] = { ...next[idx], unit: e.target.value };
                          setFormState({ ...formState, structuredIngredients: next });
                        }}
                        placeholder="Unit (ml/oz/g)"
                        className="sm:col-span-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
                      />
                      <input
                        type="text"
                        value={ing.preparation || ''}
                        onChange={(e) => {
                          const next = [...formState.structuredIngredients];
                          next[idx] = { ...next[idx], preparation: e.target.value };
                          setFormState({ ...formState, structuredIngredients: next });
                        }}
                        placeholder="Prep (e.g. Fine-strained)"
                        className="sm:col-span-3 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setFormState((prev) => ({
                            ...prev,
                            structuredIngredients: prev.structuredIngredients.filter((_, i) => i !== idx),
                          }))
                        }
                        className="sm:col-span-1 p-2 text-rose-400 hover:bg-rose-500/10 rounded-lg flex justify-center"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB C: PREPARATION INSTRUCTIONS */}
            {editorSectionTab === 'prep' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block font-bold mb-1 text-slate-300">Mixing / Culinary Method</label>
                  <select
                    value={formState.mixingMethod}
                    onChange={(e) => setFormState({ ...formState, mixingMethod: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0b0d13] border border-slate-800 text-white"
                  >
                    {MIXING_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold mb-1 text-slate-300">Preparation Time (Minutes)</label>
                  <input
                    type="number"
                    value={formState.prepTimeMinutes}
                    onChange={(e) => setFormState({ ...formState, prepTimeMinutes: Number(e.target.value) })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0b0d13] border border-slate-800 text-white"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block font-bold mb-1 text-slate-300">Preparation Instructions Overview</label>
                  <textarea
                    rows={3}
                    value={formState.preparationInstructions}
                    onChange={(e) => setFormState({ ...formState, preparationInstructions: e.target.value })}
                    placeholder="Detailed execution instructions..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0b0d13] border border-slate-800 text-white"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block font-bold mb-1 text-slate-300">Serving Instructions</label>
                  <input
                    type="text"
                    value={formState.servingInstructions}
                    onChange={(e) => setFormState({ ...formState, servingInstructions: e.target.value })}
                    placeholder="e.g. Serve straight up in a chilled half-rimmed Coupe Glass"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0b0d13] border border-slate-800 text-white"
                  />
                </div>
              </div>
            )}

            {/* TAB D: GLASSWARE INFORMATION */}
            {editorSectionTab === 'glassware' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block font-bold mb-1 text-slate-300">Glass Type</label>
                  <select
                    value={formState.glassware.glassType}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        glassware: {
                          ...formState.glassware,
                          glassType: e.target.value,
                          glassName: e.target.value,
                        },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0b0d13] border border-slate-800 text-white"
                  >
                    {GLASS_TYPES.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold mb-1 text-slate-300">Exact Glass Name</label>
                  <input
                    type="text"
                    value={formState.glassware.glassName}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        glassware: { ...formState.glassware, glassName: e.target.value },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0b0d13] border border-slate-800 text-white"
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1 text-slate-300">Glass Capacity</label>
                  <input
                    type="text"
                    value={formState.glassware.glassCapacity}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        glassware: { ...formState.glassware, glassCapacity: e.target.value },
                      })
                    }
                    placeholder="e.g. 180 ml (6 oz)"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0b0d13] border border-slate-800 text-white"
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1 text-slate-300">Glass Preparation & Rim</label>
                  <input
                    type="text"
                    value={formState.glassware.glassPreparation}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        glassware: { ...formState.glassware, glassPreparation: e.target.value },
                      })
                    }
                    placeholder="e.g. Pre-chilled with half Tajín rim"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0b0d13] border border-slate-800 text-white"
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1 text-slate-300">Ice Type</label>
                  <input
                    type="text"
                    value={formState.glassware.iceType}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        glassware: { ...formState.glassware, iceType: e.target.value },
                      })
                    }
                    placeholder="e.g. Hand-carved Crystal Ice Block / Neat"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0b0d13] border border-slate-800 text-white"
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1 text-slate-300">Ice Quantity</label>
                  <input
                    type="text"
                    value={formState.glassware.iceQuantity}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        glassware: { ...formState.glassware, iceQuantity: e.target.value },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0b0d13] border border-slate-800 text-white"
                  />
                </div>
              </div>
            )}

            {/* TAB E: GARNISH INFORMATION */}
            {editorSectionTab === 'garnish' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block font-bold mb-1 text-slate-300">Garnish Name</label>
                  <input
                    type="text"
                    value={formState.garnish.garnishName}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        garnish: { ...formState.garnish, garnishName: e.target.value },
                      })
                    }
                    placeholder="e.g. Dehydrated Mango Ribbon & Charred Lime Wheel"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0b0d13] border border-slate-800 text-white"
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1 text-slate-300">Garnish Placement</label>
                  <input
                    type="text"
                    value={formState.garnish.garnishPlacement}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        garnish: { ...formState.garnish, garnishPlacement: e.target.value },
                      })
                    }
                    placeholder="e.g. Clipped to outer rim / Floating on crema"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0b0d13] border border-slate-800 text-white"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block font-bold mb-1 text-slate-300">Final Visual Presentation Description</label>
                  <input
                    type="text"
                    value={formState.garnish.finalPresentation}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        garnish: { ...formState.garnish, finalPresentation: e.target.value },
                      })
                    }
                    placeholder="e.g. Vibrant sunset golden elixir with velvety micro-foam..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0b0d13] border border-slate-800 text-white"
                  />
                </div>
              </div>
            )}

            {/* TAB F: TECHNICAL RECIPE INFORMATION */}
            {editorSectionTab === 'technical' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div>
                  <label className="block font-bold mb-1 text-slate-300">Alcoholic / Non-Alcoholic</label>
                  <select
                    value={formState.technical.isAlcoholic}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        technical: { ...formState.technical, isAlcoholic: e.target.value as any },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0b0d13] border border-slate-800 text-white"
                  >
                    <option value="Alcoholic">Alcoholic</option>
                    <option value="Non-Alcoholic">Non-Alcoholic (Zero-Proof)</option>
                    <option value="Optional / Adaptable">Optional / Adaptable</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold mb-1 text-slate-300">
                    Alcohol Base (Optional — leave blank for Mocktails/Coffee/Food)
                  </label>
                  <input
                    type="text"
                    value={formState.technical.alcoholBase}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        technical: { ...formState.technical, alcoholBase: e.target.value },
                      })
                    }
                    placeholder="e.g. Gin, Mezcal, Rum, or None"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0b0d13] border border-slate-800 text-white"
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1 text-slate-300">Drink / Dish Color</label>
                  <input
                    type="text"
                    value={formState.technical.color}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        technical: { ...formState.technical, color: e.target.value },
                      })
                    }
                    placeholder="e.g. Golden Amber / Ruby Crimson"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0b0d13] border border-slate-800 text-white"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block font-bold mb-1 text-slate-300">Flavor Profile</label>
                  <input
                    type="text"
                    value={formState.technical.flavorProfile}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        technical: { ...formState.technical, flavorProfile: e.target.value },
                      })
                    }
                    placeholder="e.g. Ripe Mango, Bright Citrus, Gentle Smoke & Chili Spice"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0b0d13] border border-slate-800 text-white"
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1 text-slate-300">ABV & Serving Size</label>
                  <input
                    type="text"
                    value={formState.technical.abv}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        technical: { ...formState.technical, abv: e.target.value },
                      })
                    }
                    placeholder="e.g. 16% ABV (or 0.0%)"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0b0d13] border border-slate-800 text-white"
                  />
                </div>
              </div>
            )}

            {/* TAB G: PROFESSIONAL NOTES */}
            {editorSectionTab === 'notes' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block font-bold mb-1 text-slate-300">Bartender / Chef Notes</label>
                  <textarea
                    rows={3}
                    value={formState.professionalNotes.bartenderNotes}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        professionalNotes: { ...formState.professionalNotes, bartenderNotes: e.target.value },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0b0d13] border border-slate-800 text-white"
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1 text-slate-300">Substitution Options</label>
                  <textarea
                    rows={3}
                    value={formState.professionalNotes.substitutionOptions}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        professionalNotes: { ...formState.professionalNotes, substitutionOptions: e.target.value },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0b0d13] border border-slate-800 text-white"
                  />
                </div>
              </div>
            )}

            {/* TAB H: SECTION 10 — PRESENTATION IMAGES & REFERENCE PHOTOS */}
            {editorSectionTab === 'images' && (
              <div className="space-y-4 text-xs">
                <input
                  ref={mainImageUploadRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      if (typeof reader.result === 'string') {
                        setFormState((prev) => ({ ...prev, mainImage: reader.result as string }));
                      }
                    };
                    reader.readAsDataURL(file);
                  }}
                  className="hidden"
                />
                <input
                  ref={refImageUploadRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      if (typeof reader.result === 'string') {
                        setFormState((prev) => ({
                          ...prev,
                          referenceImages: [...prev.referenceImages, reader.result as string],
                        }));
                      }
                    };
                    reader.readAsDataURL(file);
                  }}
                  className="hidden"
                />

                <div className="flex flex-wrap items-center justify-between gap-2 p-4 rounded-2xl bg-[#0b0d13] border border-slate-800">
                  <div>
                    <div className="font-bold text-white">
                      AI Presentation Image Generator (Matches Glassware, Garnish & Color)
                    </div>
                    <div className="text-slate-400 text-[11px]">
                      Target: {formState.glassware.glassType} • Garnish: {formState.garnish.garnishName || 'Standard'} •
                      Color: {formState.technical.color}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={imageGenBusyId !== null}
                      onClick={() => void handleGeneratePresentationImage(undefined, true)}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#d4af37] to-amber-500 text-slate-950 font-bold flex items-center gap-1.5"
                    >
                      <Wand2 className="w-4 h-4" />
                      <span>{imageGenBusyId ? 'Generating Image...' : 'Generate AI Presentation Image'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => mainImageUploadRef.current?.click()}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 text-white font-semibold"
                    >
                      Replace Main Image
                    </button>
                    <button
                      type="button"
                      onClick={() => refImageUploadRef.current?.click()}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 text-white font-semibold"
                    >
                      + Upload Reference Photo
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-3 rounded-2xl bg-[#0b0d13] border border-slate-800 space-y-2">
                    <div className="font-bold text-[#ffd700]">1. Main Recipe Image</div>
                    {formState.mainImage ? (
                      <img src={formState.mainImage} alt="Main" className="w-full h-44 object-cover rounded-xl" />
                    ) : (
                      <div className="h-44 flex items-center justify-center text-slate-500 border border-dashed border-slate-800 rounded-xl">
                        Auto-generated on save or click Generate
                      </div>
                    )}
                  </div>

                  <div className="p-3 rounded-2xl bg-[#0b0d13] border border-slate-800 space-y-2">
                    <div className="font-bold text-indigo-400">2. AI Presentation Image</div>
                    {formState.aiPresentationImage ? (
                      <img
                        src={formState.aiPresentationImage}
                        alt="AI Presentation"
                        className="w-full h-44 object-cover rounded-xl"
                      />
                    ) : (
                      <div className="h-44 flex items-center justify-center text-slate-500 border border-dashed border-slate-800 rounded-xl">
                        Click &ldquo;Generate AI Presentation Image&rdquo;
                      </div>
                    )}
                  </div>

                  <div className="p-3 rounded-2xl bg-[#0b0d13] border border-slate-800 space-y-2">
                    <div className="font-bold text-emerald-400">
                      3. Uploaded Reference Images ({formState.referenceImages.length})
                    </div>
                    {formState.referenceImages[0] ? (
                      <img
                        src={formState.referenceImages[0]}
                        alt="Reference"
                        className="w-full h-44 object-cover rounded-xl"
                      />
                    ) : (
                      <div className="h-44 flex items-center justify-center text-slate-500 border border-dashed border-slate-800 rounded-xl">
                        No reference notebook photo attached
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Editor Modal Footer */}
            <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsEditorOpen(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSaveRecipeForm()}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#d4af37] via-[#ffd700] to-[#c5a059] text-slate-950 text-xs font-extrabold uppercase tracking-wider shadow-lg"
              >
                Save to Recipe Book
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          SECTION 7: PHOTO-TO-RECIPE OCR REVIEW MODAL
         ===================================================================== */}
      {isOcrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
          <div className="max-w-3xl w-full bg-[#11141d] border border-[#d4af37]/40 rounded-3xl p-6 space-y-4 text-white">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Camera className="w-4 h-4 text-[#ffd700]" />
                <span>Photo-to-Recipe Structured AI Extraction</span>
              </h3>
              <button type="button" onClick={() => setIsOcrModalOpen(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl overflow-hidden border border-slate-800 bg-black h-64">
                {ocrImageDataUrl && (
                  <img src={ocrImageDataUrl} alt="Uploaded Recipe Note" className="w-full h-full object-contain" />
                )}
              </div>

              <div className="space-y-3 text-xs">
                {ocrBusy ? (
                  <div className="h-full flex flex-col items-center justify-center text-center py-12">
                    <RefreshCw className="w-7 h-7 text-[#ffd700] animate-spin mb-2" />
                    <div className="font-bold">Extracting Structured Recipe Fields...</div>
                    <div className="text-slate-400 mt-1">
                      Reading recipe name, ingredients, quantities, glassware & garnish without inventing data.
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <div className="font-bold text-[#ffd700] mb-1">Detected Recipe: {formState.name}</div>
                      <div className="text-slate-300">{ocrExtractionSummary}</div>
                    </div>

                    {formState.uncertainFields && formState.uncertainFields.length > 0 && (
                      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300">
                        <strong>Uncertain / Illegible Fields Flagged:</strong> {formState.uncertainFields.join(', ')}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsOcrModalOpen(false);
                          setEditorSectionTab('basic');
                          setIsEditorOpen(true);
                        }}
                        className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold"
                      >
                        Review & Edit Extracted Recipe
                      </button>
                      <button
                        type="button"
                        onClick={() => void runPhotoExtraction(ocrImageDataUrl, true)}
                        className="px-4 py-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold"
                      >
                        Generate Missing Suggestions
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsOcrModalOpen(false);
                          void handleSaveRecipeForm();
                        }}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                      >
                        Save Directly to Recipe Book
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
