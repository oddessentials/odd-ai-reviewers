import type { BenchmarkScenario, ExpectedFinding } from '../../../src/benchmark/scoring.js';

export interface CuratedExternalBenchmarkScenario extends BenchmarkScenario {
  sourceUrl: string;
  mode: 'recall' | 'precision';
  rationale: string;
  allowedAdditionalFindings?: ExpectedFinding[];
  forbiddenMessageSubstrings?: string[];
}

export const curatedGrafanaScenarios: CuratedExternalBenchmarkScenario[] = [
  {
    id: 'grafana-103633-cache-trust-asymmetry',
    category: 'external-benchmark',
    pattern: 'F',
    description: 'AuthZ cache fast-path trusts cached grants but falls through on denials',
    sourceIssue: '#192.103633',
    sourceUrl: 'https://github.com/grafana/grafana/pull/103633',
    mode: 'recall',
    prDescription: `AuthZService: improve authz caching

This PR contains several changes to allow users to fetch newly created dashboards and folders.

The changes are:
* on client side: remove the use of authLib cache when running authZ service in-proc
* on server side: add a denial cache to return quickly when we know that a user does not have permission on a specific resource
* on server side: if permission denial cache is not hit, and the requested resource is not found in cached permissions, requery permissions from the DB

Why do we need this feature?

Otherwise dash/folder creator can't access the dashboard/folder that they've just created.`,
    rationale:
      'High-value authorization correctness miss. The diff shows a negative cache being added alongside an allow-path fast return, which is the kind of asymmetry the review should catch.',
    diff: `diff --git a/pkg/services/authz/rbac/service.go b/pkg/services/authz/rbac/service.go
--- a/pkg/services/authz/rbac/service.go
+++ b/pkg/services/authz/rbac/service.go
@@ -53,11 +53,12 @@ type Service struct {
 \tsf *singleflight.Group
 
 \t// Cache for user permissions, user team memberships and user basic roles
-\tidCache        *cacheWrap[store.UserIdentifiers]
-\tpermCache      *cacheWrap[map[string]bool]
-\tteamCache      *cacheWrap[[]int64]
-\tbasicRoleCache *cacheWrap[store.BasicRole]
-\tfolderCache    *cacheWrap[folderTree]
+\tidCache         *cacheWrap[store.UserIdentifiers]
+\tpermCache       *cacheWrap[map[string]bool]
+\tpermDenialCache *cacheWrap[bool]
+\tteamCache       *cacheWrap[[]int64]
+\tbasicRoleCache  *cacheWrap[store.BasicRole]
+\tfolderCache     *cacheWrap[folderTree]
 }
 
 func NewService(
@@ -111,6 +113,29 @@ func (s *Service) Check(ctx context.Context, req *authzv1.CheckRequest) (*authzv
 \t\tattribute.String("folder", checkReq.ParentFolder),
 \t)
 
+\tpermDenialKey := userPermDenialCacheKey(checkReq.Namespace.Value, checkReq.UserUID, checkReq.Action, checkReq.Name, checkReq.ParentFolder)
+\tif _, ok := s.permDenialCache.Get(ctx, permDenialKey); ok {
+\t\ts.metrics.permissionCacheUsage.WithLabelValues("true", checkReq.Action).Inc()
+\t\treturn &authzv1.CheckResponse{Allowed: false}, nil
+\t}
+
+\tcachedPerms, err := s.getCachedIdentityPermissions(ctx, checkReq.Namespace, checkReq.IdentityType, checkReq.UserUID, checkReq.Action)
+\tif err == nil {
+\t\tallowed, err := s.checkPermission(ctx, cachedPerms, checkReq)
+\t\tif err != nil {
+\t\t\treturn deny, err
+\t\t}
+\t\tif allowed {
+\t\t\ts.metrics.permissionCacheUsage.WithLabelValues("true", checkReq.Action).Inc()
+\t\t\treturn &authzv1.CheckResponse{Allowed: allowed}, nil
+\t\t}
+\t}
+\ts.metrics.permissionCacheUsage.WithLabelValues("false", checkReq.Action).Inc()
+
 \tpermissions, err := s.getIdentityPermissions(ctx, checkReq.Namespace, checkReq.IdentityType, checkReq.UserUID, checkReq.Action)
 \tif err != nil {
 \t\tctxLogger.Error("could not get user permissions", "subject", req.GetSubject(), "error", err)
 @@ -125,6 +150,10 @@ func (s *Service) Check(ctx context.Context, req *authzv1.CheckRequest) (*authzv
 \t\treturn deny, err
 \t}
 
+\tif !allowed {
+\t\ts.permDenialCache.Set(ctx, permDenialKey, true)
+\t}
+
 \treturn &authzv1.CheckResponse{Allowed: allowed}, nil
 }
diff --git a/pkg/services/authz/rbac/service_test.go b/pkg/services/authz/rbac/service_test.go
--- a/pkg/services/authz/rbac/service_test.go
+++ b/pkg/services/authz/rbac/service_test.go
@@ -898,6 +890,37 @@ func TestService_Check(t *testing.T) {
 \t})
 }
 
+func TestService_CacheCheck(t *testing.T) {
+\tctx := context.Background()
+\tuserID := &store.UserIdentifiers{UID: "test-uid", ID: 1}
+
+\tt.Run("Should deny on explicit cache deny entry", func(t *testing.T) {
+\t\ts := setupService()
+
+\t\ts.idCache.Set(ctx, userIdentifierCacheKey("org-12", "test-uid"), *userID)
+
+\t\t// Explicitly deny access to the dashboard
+\t\ts.permDenialCache.Set(ctx, userPermDenialCacheKey("org-12", "test-uid", "dashboards:read", "dash1", "fold1"), true)
+
+\t\t// Allow access to the dashboard to prove this is not checked
+\t\ts.permCache.Set(ctx, userPermCacheKey("org-12", "test-uid", "dashboards:read"), map[string]bool{"dashboards:uid:dash1": false})
+
+\t\tresp, err := s.Check(ctx, &authzv1.CheckRequest{
+\t\t\tNamespace: "org-12",
+\t\t\tSubject:   "user:test-uid",
+\t\t\tGroup:     "dashboard.grafana.app",
+\t\t\tResource:  "dashboards",
+\t\t\tVerb:      "get",
+\t\t\tName:      "dash1",
+\t\t\tFolder:    "fold1",
+\t\t})
+\t\trequire.NoError(t, err)
+\t\tassert.False(t, resp.Allowed)
+\t})
+}
`,
    expectedFindings: [
      {
        file: 'pkg/services/authz/rbac/service.go',
        severityAtLeast: 'warning',
        messageContains: 'cache',
      },
    ],
    truePositive: true,
    allowedAdditionalFindings: [
      {
        file: 'pkg/services/authz/rbac/service_test.go',
        severityAtLeast: 'warning',
        messageContains: 'contradict',
      },
      {
        file: 'pkg/services/authz/rbac/service.go',
        severityAtLeast: 'info',
        messageContains: 'metric',
      },
      {
        file: 'pkg/services/authz/rbac/service_test.go',
        severityAtLeast: 'info',
        messageContains: 'cache invalidation behavior',
      },
      {
        file: 'pkg/services/authz/rbac/service_test.go',
        severityAtLeast: 'info',
        messageContains: 'permissions could be updated',
      },
    ],
  },
  {
    id: 'grafana-90939-error-path-cache-overwrite',
    category: 'external-benchmark',
    pattern: 'F',
    description: 'Web assets cache is protected by a lock but still writes result after an error',
    sourceIssue: '#192.90939',
    sourceUrl: 'https://github.com/grafana/grafana/pull/90939',
    mode: 'recall',
    rationale:
      'This PR already triggered one true positive in the live slice, but it still missed the more important error-path cache overwrite. The curated case targets that gap directly.',
    diff: `diff --git a/pkg/api/webassets/webassets.go b/pkg/api/webassets/webassets.go
--- a/pkg/api/webassets/webassets.go
+++ b/pkg/api/webassets/webassets.go
@@ -8,6 +8,7 @@ import (
 \t"net/http"
 \t"os"
 \t"path/filepath"
+\t"sync"
 
 \t"github.com/grafana/grafana/pkg/api/dtos"
 \t"github.com/grafana/grafana/pkg/services/licensing"
@@ -31,12 +32,21 @@ type EntryPointInfo struct {
 \t} \`json:"assets,omitempty"\`
 }
 
-var entryPointAssetsCache *dtos.EntryPointAssets = nil
+var (
+\tentryPointAssetsCacheMu sync.RWMutex           // guard entryPointAssetsCache
+\tentryPointAssetsCache   *dtos.EntryPointAssets // TODO: get rid of global state
+)
 
 func GetWebAssets(ctx context.Context, cfg *setting.Cfg, license licensing.Licensing) (*dtos.EntryPointAssets, error) {
-\tif cfg.Env != setting.Dev && entryPointAssetsCache != nil {
-\t\treturn entryPointAssetsCache, nil
+\tentryPointAssetsCacheMu.RLock()
+\tret := entryPointAssetsCache
+\tentryPointAssetsCacheMu.RUnlock()
+
+\tif cfg.Env != setting.Dev && ret != nil {
+\t\treturn ret, nil
 \t}
+\tentryPointAssetsCacheMu.Lock()
+\tdefer entryPointAssetsCacheMu.Unlock()
 
 \tvar err error
 \tvar result *dtos.EntryPointAssets
`,
    expectedFindings: [
      {
        file: 'pkg/api/webassets/webassets.go',
        severityAtLeast: 'warning',
        messageContains: 'cache',
      },
    ],
    truePositive: true,
    allowedAdditionalFindings: [
      {
        file: 'pkg/api/webassets/webassets.go',
        severityAtLeast: 'warning',
        messageContains: 'lock',
      },
    ],
  },
  {
    id: 'grafana-76186-nil-request-and-trace-context',
    category: 'external-benchmark',
    pattern: 'F',
    description:
      'Plugin middleware refactor dereferences request PluginContext and drops trace-aware logging fields',
    sourceIssue: '#192.76186',
    sourceUrl: 'https://github.com/grafana/grafana/pull/76186',
    mode: 'recall',
    prDescription: `Plugins: Chore: Renamed instrumentation middleware to metrics middleware

What is this feature?

- Renames the InstrumentationMiddleware to MetricsMiddleware
- Moves the contextual logger from the Instrumentation/Metrics middleware to the LoggerMiddleware

Why do we need this feature?

Better naming and consistency.`,
    rationale:
      'This regression combines a concrete nil-request panic risk with lost trace context in structured logs. It is representative of refactor-induced observability and safety regressions.',
    diff: `diff --git a/pkg/services/pluginsintegration/clientmiddleware/contextual_logger_middleware.go b/pkg/services/pluginsintegration/clientmiddleware/contextual_logger_middleware.go
--- /dev/null
+++ b/pkg/services/pluginsintegration/clientmiddleware/contextual_logger_middleware.go
@@ -0,0 +1,69 @@
+package clientmiddleware
+
+import (
+\t"context"
+
+\t"github.com/grafana/grafana-plugin-sdk-go/backend"
+
+\t"github.com/grafana/grafana/pkg/infra/log"
+\t"github.com/grafana/grafana/pkg/plugins"
+)
+
+func NewContextualLoggerMiddleware() plugins.ClientMiddleware {
+\treturn plugins.ClientMiddlewareFunc(func(next plugins.Client) plugins.Client {
+\t\treturn &ContextualLoggerMiddleware{
+\t\t\tnext: next,
+\t\t}
+\t})
+}
+
+type ContextualLoggerMiddleware struct {
+\tnext plugins.Client
+}
+
+func instrumentContext(ctx context.Context, endpoint string, pCtx backend.PluginContext) context.Context {
+\tp := []any{"endpoint", endpoint, "pluginId", pCtx.PluginID}
+\tif pCtx.DataSourceInstanceSettings != nil {
+\t\tp = append(p, "dsName", pCtx.DataSourceInstanceSettings.Name)
+\t\tp = append(p, "dsUID", pCtx.DataSourceInstanceSettings.UID)
+\t}
+\tif pCtx.User != nil {
+\t\tp = append(p, "uname", pCtx.User.Login)
+\t}
+\treturn log.WithContextualAttributes(ctx, p)
+}
+
+func (m *ContextualLoggerMiddleware) QueryData(ctx context.Context, req *backend.QueryDataRequest) (*backend.QueryDataResponse, error) {
+\tctx = instrumentContext(ctx, endpointQueryData, req.PluginContext)
+\treturn m.next.QueryData(ctx, req)
+}
+
+func (m *ContextualLoggerMiddleware) CallResource(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
+\tctx = instrumentContext(ctx, endpointCallResource, req.PluginContext)
+\treturn m.next.CallResource(ctx, req, sender)
+}
+
+func (m *ContextualLoggerMiddleware) CheckHealth(ctx context.Context, req *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
+\tctx = instrumentContext(ctx, endpointCheckHealth, req.PluginContext)
+\treturn m.next.CheckHealth(ctx, req)
+}
+
+func (m *ContextualLoggerMiddleware) CollectMetrics(ctx context.Context, req *backend.CollectMetricsRequest) (*backend.CollectMetricsResult, error) {
+\tctx = instrumentContext(ctx, endpointCollectMetrics, req.PluginContext)
+\treturn m.next.CollectMetrics(ctx, req)
+}
diff --git a/pkg/services/pluginsintegration/clientmiddleware/logger_middleware.go b/pkg/services/pluginsintegration/clientmiddleware/logger_middleware.go
--- a/pkg/services/pluginsintegration/clientmiddleware/logger_middleware.go
+++ b/pkg/services/pluginsintegration/clientmiddleware/logger_middleware.go
@@ -6,8 +6,8 @@ import (
 \t"time"
 
 \t"github.com/grafana/grafana-plugin-sdk-go/backend"
+
 \t"github.com/grafana/grafana/pkg/infra/log"
-\t"github.com/grafana/grafana/pkg/infra/tracing"
 \t"github.com/grafana/grafana/pkg/plugins"
 \tplog "github.com/grafana/grafana/pkg/plugins/log"
 \t"github.com/grafana/grafana/pkg/setting"
@@ -33,10 +33,11 @@ type LoggerMiddleware struct {
 \tlogger plog.Logger
 }
 
-func (m *LoggerMiddleware) logRequest(ctx context.Context, pluginCtx backend.PluginContext, endpoint string, fn func(ctx context.Context) error) error {
+func (m *LoggerMiddleware) logRequest(ctx context.Context, fn func(ctx context.Context) error) error {
 \tstatus := statusOK
 \tstart := time.Now()
 \ttimeBeforePluginRequest := log.TimeSinceStart(ctx, start)
+
 \terr := fn(ctx)
 \tif err != nil {
 \t\tstatus = statusError
@@ -48,31 +49,13 @@ func (m *LoggerMiddleware) logRequest(ctx context.Context, pluginCtx backend.Plu
 \tlogParams := []any{
 \t\t"status", status,
 \t\t"duration", time.Since(start),
-\t\t"pluginId", pluginCtx.PluginID,
-\t\t"endpoint", endpoint,
 \t\t"eventName", "grafana-data-egress",
 \t\t"time_before_plugin_request", timeBeforePluginRequest,
 \t}
-
-\tif pluginCtx.User != nil {
-\t\tlogParams = append(logParams, "uname", pluginCtx.User.Login)
-\t}
-
-\ttraceID := tracing.TraceIDFromContext(ctx, false)
-\tif traceID != "" {
-\t\tlogParams = append(logParams, "traceID", traceID)
-\t}
-
-\tif pluginCtx.DataSourceInstanceSettings != nil {
-\t\tlogParams = append(logParams, "dsName", pluginCtx.DataSourceInstanceSettings.Name)
-\t\tlogParams = append(logParams, "dsUID", pluginCtx.DataSourceInstanceSettings.UID)
-\t}
-
 \tif status == statusError {
 \t\tlogParams = append(logParams, "error", err)
 \t}
-
-\tm.logger.Info("Plugin Request Completed", logParams...)
+\tm.logger.FromContext(ctx).Info("Plugin Request Completed", logParams...)
 \treturn err
 }
`,
    expectedFindings: [
      {
        file: 'pkg/services/pluginsintegration/clientmiddleware/contextual_logger_middleware.go',
        severityAtLeast: 'warning',
        messageContains: 'nil',
      },
    ],
    truePositive: true,
    allowedAdditionalFindings: [
      {
        file: 'pkg/services/pluginsintegration/clientmiddleware/logger_middleware.go',
        severityAtLeast: 'info',
        messageContains: 'trace',
      },
      {
        file: 'pkg/services/pluginsintegration/clientmiddleware/logger_middleware.go',
        severityAtLeast: 'warning',
        messageContains: 'logging context',
      },
      {
        file: 'pkg/services/pluginsintegration/clientmiddleware/contextual_logger_middleware.go',
        severityAtLeast: 'error',
        messageContains: 'missing nil check before accessing req.PluginContext',
      },
    ],
    forbiddenMessageSubstrings: ['undefined constant'],
  },
  {
    id: 'grafana-97529-race-keeps-true-positive-drops-startup-noise',
    category: 'external-benchmark',
    pattern: 'F',
    description:
      'Unified storage race regression should remain, but startup speculation should disappear',
    sourceIssue: '#192.97529',
    sourceUrl: 'https://github.com/grafana/grafana/pull/97529',
    mode: 'precision',
    prDescription: `Unified Storage: Init at startup, fix traces, and speed up indexing

Changes:
- Initializes unified storage when the ResourceServer is created, instead of doing it inside the first gRPC call it receives. This was causing context cancelled errors since the index takes too long to build within the context of the gRPC call.
- Fixes trace propagation by passing span contexts down.
- Improves index build speed using finer grain locking when writing the index cache. We were locking the whole BuildIndex function, which was slowing things down when building many namespaces with high concurrency.

`,
    rationale:
      'The live slice already found the real race, but also produced speculative startup advice. This case keeps the concurrency signal while forbidding the operational noise.',
    diff: `diff --git a/pkg/storage/unified/resource/server.go b/pkg/storage/unified/resource/server.go
--- a/pkg/storage/unified/resource/server.go
+++ b/pkg/storage/unified/resource/server.go
@@ -255,6 +255,12 @@ func NewResourceServer(opts ResourceServerOptions) (ResourceServer, error) {
 \t\t}
 \t}
 
+\terr := s.Init(ctx)
+\tif err != nil {
+\t\ts.log.Error("error initializing resource server", "error", err)
+\t\treturn nil, err
+\t}
+
 \treturn s, nil
 }
@@ -294,16 +300,16 @@ func (s *server) Init(ctx context.Context) error {
-\t\t// Start watching for changes
-\t\tif s.initErr == nil {
-\t\t\ts.initErr = s.initWatcher()
-\t\t}
-
 \t\t// initialize the search index
 \t\tif s.initErr == nil && s.search != nil {
 \t\t\ts.initErr = s.search.init(ctx)
 \t\t}
+
+\t\t// Start watching for changes
+\t\tif s.initErr == nil {
+\t\t\ts.initErr = s.initWatcher()
+\t\t}
diff --git a/pkg/storage/unified/search/bleve.go b/pkg/storage/unified/search/bleve.go
--- a/pkg/storage/unified/search/bleve.go
+++ b/pkg/storage/unified/search/bleve.go
@@ -85,9 +85,6 @@ func (b *bleveBackend) BuildIndex(ctx context.Context,
 \t// The builder will write all documents before returning
 \tbuilder func(index resource.ResourceIndex) (int64, error),
 ) (resource.ResourceIndex, error) {
-\tb.cacheMu.Lock()
-\tdefer b.cacheMu.Unlock()
-
 \t_, span := b.tracer.Start(ctx, tracingPrexfixBleve+"BuildIndex")
 \tdefer span.End()
@@ -137,7 +134,9 @@ func (b *bleveBackend) BuildIndex(ctx context.Context,
 \t\treturn nil, err
 \t}
 
+\tb.cacheMu.Lock()
 \tb.cache[key] = idx
+\tb.cacheMu.Unlock()
 \treturn idx, nil
 }
`,
    expectedFindings: [
      {
        file: 'pkg/storage/unified/search/bleve.go',
        severityAtLeast: 'warning',
        messageContains: 'race',
      },
    ],
    truePositive: true,
    allowedAdditionalFindings: [
      {
        file: 'pkg/storage/unified/search/bleve.go',
        severityAtLeast: 'warning',
        messageContains: 'cache',
      },
    ],
    forbiddenMessageSubstrings: ['eager initialization', 'blocking startup', 'less flexible'],
  },
  {
    id: 'grafana-80329-logging-signal-keeps-true-positive-drops-speculation',
    category: 'external-benchmark',
    pattern: 'F',
    description:
      'Logging misuse should remain, but speculative load and injection concerns should disappear',
    sourceIssue: '#192.80329',
    sourceUrl: 'https://github.com/grafana/grafana/pull/80329',
    mode: 'precision',
    prDescription: `Annotations: Split cleanup into separate queries and deletes to avoid deadlocks on MySQL

Writes to annotations are sometimes rejected on MySQL due to a recurring deadlock with the annotation cleanup job.

This PR splits the subquery into a separate SQL statement. These statements do not share a transaction, and therefore allow locks to flush in between.

Unfortunately we could not reduce this to a single DELETE statement, due to the batching - DELETE LIMIT is not supported on all databases without needing to reintroduce the subquery. The IDs loaded into memory are of bounded size due to the batch size configuration.`,
    rationale:
      'The live slice found the correct low-severity logging issue, but it also emitted multiple speculative operational findings. The curated case keeps the concrete signal only.',
    diff: `diff --git a/pkg/services/annotations/annotationsimpl/xorm_store.go b/pkg/services/annotations/annotationsimpl/xorm_store.go
--- a/pkg/services/annotations/annotationsimpl/xorm_store.go
+++ b/pkg/services/annotations/annotationsimpl/xorm_store.go
@@ -519,52 +520,135 @@ func (r *xormRepositoryImpl) CleanAnnotations(ctx context.Context, cfg setting.A
 \tvar totalAffected int64
 \tif cfg.MaxAge > 0 {
 \t\tcutoffDate := timeNow().Add(-cfg.MaxAge).UnixNano() / int64(time.Millisecond)
+\t\t// Single-statement approaches, specifically ones using batched sub-queries, seem to deadlock with concurrent inserts on MySQL.
+\t\t// We have a bounded batch size, so work around this by first loading the IDs into memory and allowing any locks to flush inside each batch.
+\t\taffected, err := untilDoneOrCancelled(ctx, func() (int64, error) {
+\t\t\tcond := fmt.Sprintf(\`%s AND created < %v ORDER BY id DESC %s\`, annotationType, cutoffDate, r.db.GetDialect().Limit(r.cfg.AnnotationCleanupJobBatchSize))
+\t\t\tids, err := r.fetchIDs(ctx, "annotation", cond)
+\t\t\tif err != nil {
+\t\t\t\treturn 0, err
+\t\t\t}
+\t\t\tr.log.Error("Annotations to clean by time", "count", len(ids), "ids", ids, "cond", cond, "err", err)
+
+\t\t\tx, y := r.deleteByIDs(ctx, "annotation", ids)
+\t\t\tr.log.Error("cleaned annotations by time", "count", len(ids), "affected", x, "err", y)
+\t\t\treturn x, y
+\t\t})
 \t}
@@ -571,6 +655,25 @@ func (r *xormRepositoryImpl) deleteByIDs(ctx context.Context, table string, ids
 \t// SQLite has a parameter limit of 999.
 \t// If the batch size is bigger than that, and we're on SQLite, we have to put the IDs directly into the statement.
 \tconst sqliteParameterLimit = 999
+\tif r.db.GetDBType() == migrator.SQLite && r.cfg.AnnotationCleanupJobBatchSize > sqliteParameterLimit {
+\t\tvalues := fmt.Sprint(ids[0])
+\t\tfor _, v := range ids[1:] {
+\t\t\tvalues = fmt.Sprintf("%s, %d", values, v)
+\t\t}
+\t\tsql = fmt.Sprintf(\`DELETE FROM %s WHERE id IN (%s)\`, table, values)
+\t} else {
+\t\tplaceholders := "?" + strings.Repeat(",?", len(ids)-1)
+\t\tsql = fmt.Sprintf(\`DELETE FROM %s WHERE id IN (%s)\`, table, placeholders)
+\t\targs = asAny(ids)
+\t}
diff --git a/pkg/services/cleanup/cleanup.go b/pkg/services/cleanup/cleanup.go
--- a/pkg/services/cleanup/cleanup.go
+++ b/pkg/services/cleanup/cleanup.go
@@ -74,7 +74,7 @@ func (j cleanUpJob) String() string {
 func (srv *CleanUpService) Run(ctx context.Context) error {
 \tsrv.cleanUpTmpFiles(ctx)
 
-\tticker := time.NewTicker(time.Minute * 10)
+\tticker := time.NewTicker(time.Minute * 1)
 \tfor {
 \t\tselect {
 \t\tcase <-ticker.C:
`,
    expectedFindings: [
      {
        file: 'pkg/services/annotations/annotationsimpl/xorm_store.go',
        severityAtLeast: 'info',
        messageContains: 'Error-level logging',
      },
    ],
    truePositive: true,
    allowedAdditionalFindings: [
      {
        file: 'pkg/services/annotations/annotationsimpl/xorm_store.go',
        severityAtLeast: 'warning',
        messageContains: 'successful cleanup',
      },
    ],
    forbiddenMessageSubstrings: [
      '10x',
      'increase system load',
      'sql injection mitigation',
      'all IDs are numeric',
    ],
  },
];
