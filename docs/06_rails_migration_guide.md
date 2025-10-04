# Rails Migration Guide

This document provides guidance for migrating the bun-osv-scanner architecture and patterns to Ruby on Rails.

## Overview

The bun-osv-scanner project is designed with architectural patterns that translate well to Rails. This guide maps TypeScript/Bun concepts to their Ruby/Rails equivalents.

## High-Level Architecture Mapping

### TypeScript/Bun → Ruby/Rails

| Layer | TypeScript | Rails Equivalent |
|-------|-----------|------------------|
| `types/` | TypeScript types | Sorbet types / RBS files / Value Objects |
| `foundation/` | Pure functions | `lib/` utility modules |
| `core/` | Business logic | Domain services in `app/services/` |
| `ports/` | Interface types | Ruby modules / abstract classes |
| `adapters/` | I/O implementations | Adapters in `app/adapters/` |
| `app/` | Orchestration | Service objects in `app/services/` |
| `boot/` | Composition root | Initializers / Dependency injection setup |

## Technology Stack Migration

### Runtime & Language

```typescript
// TypeScript (Bun)
const result: Result<Data, Error> = parse(input);

# Ruby (Rails)
result = parse(input) # => Result[Data, Error]
```

**Recommendations:**
- Use **Sorbet** or **RBS** for type checking (optional but recommended)
- Use **dry-monads** gem for `Result` / `Either` types
- Use **Ruby 3.x** for pattern matching

### Package Management

```bash
# Bun
bun install
bun.lock

# Rails
bundle install
Gemfile.lock
```

### External Tool Integration

```typescript
// TypeScript: Invoke osv-scanner CLI
const process = Bun.spawn({ cmd: ["osv-scanner", ...] });

# Ruby: Use OSV HTTP API instead
response = HTTP.post("https://api.osv.dev/v1/querybatch", json: sbom)
```

**Recommendation:** Use OSV's REST API instead of CLI for better Rails integration (the Bun template already defaults to REST and keeps the CLI adapter as an opt-in path).

## Functional Programming in Ruby

### Result Type Pattern

#### TypeScript Implementation

```typescript
type Result<T, E> =
  | { ok: true; data: T }
  | { ok: false; error: E };

const ok = <T, E>(data: T): Result<T, E> => ({ ok: true, data });
const err = <T, E>(error: E): Result<T, E> => ({ ok: false, error });
```

#### Ruby Implementation (using dry-monads)

```ruby
require 'dry/monads'

class MyService
  include Dry::Monads[:result]

  def parse_lock(data)
    return Failure(:invalid_document) unless data.is_a?(Hash)
    Success(extract_coordinates(data))
  end
end

# Usage
result = service.parse_lock(data)
case result
in Success(coordinates)
  # Handle success
in Failure(error)
  # Handle error
end
```

### Pure Functions vs. Service Objects

#### TypeScript Implementation

```typescript
// Pure function
export const classifyPackageSeverity = (
  finding: OsvPackageFinding
): AdvisoryLevel | null => {
  const labels = collectSeverityLabels(finding);
  if (labels.some(label => FATAL_LABELS.has(label))) {
    return ADVISORY_LEVEL_FATAL;
  }
  return null;
};
```

#### Ruby Implementation

```ruby
# app/services/severity_classifier.rb
module SeverityClassifier
  FATAL_LABELS = %w[CRITICAL HIGH].freeze
  ADVISORY_LEVEL_FATAL = 'fatal'

  module_function

  def classify(finding)
    labels = collect_severity_labels(finding)
    return ADVISORY_LEVEL_FATAL if labels.any? { |l| FATAL_LABELS.include?(l) }
    nil
  end

  def collect_severity_labels(finding)
    finding.vulnerabilities.filter_map do |v|
      v.dig(:database_specific, :severity)
    end
  end
end
```

## Layered Architecture in Rails

### Directory Structure

```
app/
├── adapters/               # Equivalent to TypeScript adapters/
│   └── osv_api_adapter.rb
├── services/               # Equivalent to core/ + app/
│   ├── domain/             # Pure business logic (core/)
│   │   ├── severity_classifier.rb
│   │   └── sbom_generator.rb
│   └── security_service.rb # Orchestration (app/)
├── ports/                  # Abstract interfaces
│   └── osv_scanner_port.rb
└── models/                 # ActiveRecord + Value Objects
    └── dependency_coordinate.rb

lib/
└── foundation/             # Pure utilities
    └── gemfile_lock_parser.rb

config/
└── initializers/
    └── scanner.rb          # Composition root (boot/)
```

### Foundation Layer (Utilities)

#### TypeScript

```typescript
// foundation/bunLockParser.ts
export const parseBunLock = (
  document: unknown
): Result<DependencyCoordinate[], ParseError> => {
  // Pure parsing logic
};
```

#### Ruby

```ruby
# lib/foundation/gemfile_lock_parser.rb
module Foundation
  module GemfileLockParser
    module_function

    def parse(lockfile_content)
      parser = Bundler::LockfileParser.new(lockfile_content)
      coordinates = parser.specs.map do |spec|
        DependencyCoordinate.new(
          name: spec.name,
          version: spec.version.to_s,
          ecosystem: 'RubyGems'
        )
      end
      Success(coordinates)
    rescue => e
      Failure(parse_error: e.message)
    end
  end
end
```

### Core Layer (Business Logic)

#### TypeScript

```typescript
// core/severity.ts
export const classifyPackageSeverity = (
  finding: OsvPackageFinding
): AdvisoryLevel | null => {
  // Pure classification logic
};
```

#### Ruby

```ruby
# app/services/domain/severity_classifier.rb
module Domain
  module SeverityClassifier
    FATAL_CVSS_THRESHOLD = 7.0
    WARN_CVSS_THRESHOLD = 4.0

    module_function

    def classify(finding)
      labels = collect_labels(finding)
      return 'fatal' if fatal_labels?(labels)
      
      severity = max_numeric_severity(finding)
      return 'fatal' if severity && severity >= FATAL_CVSS_THRESHOLD
      
      return 'warn' if warn_labels?(labels)
      return 'warn' if severity && severity >= WARN_CVSS_THRESHOLD
      
      nil
    end

    private

    def collect_labels(finding)
      # Extract severity labels
    end

    def fatal_labels?(labels)
      (labels & %w[CRITICAL HIGH]).any?
    end

    def max_numeric_severity(finding)
      # Extract and parse CVSS scores
    end
  end
end
```

### Ports Layer (Interfaces)

#### TypeScript

```typescript
// ports/osvScannerPort.ts
export type OsvScannerPort = {
  readonly scan: (sbomJson: string) => Promise<Result<...>>;
};
```

#### Ruby

```ruby
# app/ports/osv_scanner_port.rb
module OsvScannerPort
  def scan(sbom_json)
    raise NotImplementedError, "#{self.class} must implement #scan"
  end
end
```

### Adapters Layer (I/O)

#### TypeScript

```typescript
// adapters/osvScannerCli.ts
export const createOsvScannerCliAdapter = (): OsvScannerPort => ({
  async scan(sbomJson) {
    const process = Bun.spawn({ cmd: [...] });
    return parseOutput(await process.text());
  }
});
```

#### Ruby

```ruby
# app/adapters/osv_api_adapter.rb
class OsvApiAdapter
  include OsvScannerPort
  include Dry::Monads[:result]

  API_ENDPOINT = 'https://api.osv.dev/v1/querybatch'

  def scan(sbom_json)
    sbom = JSON.parse(sbom_json)
    queries = build_queries(sbom)
    
    response = HTTP.post(API_ENDPOINT, json: { queries: queries })
    
    return Failure(:api_error) unless response.status.success?
    
    body = JSON.parse(response.body)
    Success(transform_response(body))
  rescue => e
    Failure(error: e.message)
  end

  private

  def build_queries(sbom)
    sbom['components'].map do |component|
      {
        package: {
          name: component['name'],
          ecosystem: 'RubyGems'
        },
        version: component['version']
      }
    end
  end

  def transform_response(body)
    # Transform OSV API response to internal format
  end
end
```

### App Layer (Orchestration)

#### TypeScript

```typescript
// app/securityService.ts
export const createSecurityService = (deps) => ({
  async scan(lock) {
    const parsed = deps.parseLock(lock);
    const sbom = deps.generateSbom(parsed.data);
    const result = await deps.osvScanner.scan(sbom);
    return buildAdvisories(result);
  }
});
```

#### Ruby

```ruby
# app/services/security_service.rb
class SecurityService
  include Dry::Monads[:result]

  def initialize(
    lock_parser: Foundation::GemfileLockParser,
    sbom_generator: Domain::SbomGenerator,
    severity_classifier: Domain::SeverityClassifier,
    osv_scanner: OsvApiAdapter.new
  )
    @lock_parser = lock_parser
    @sbom_generator = sbom_generator
    @severity_classifier = severity_classifier
    @osv_scanner = osv_scanner
  end

  def scan(lockfile_content)
    result = @lock_parser.parse(lockfile_content)
    return result if result.failure?

    coordinates = result.value!
    sbom = @sbom_generator.generate(coordinates)
    sbom_json = sbom.to_json

    scan_result = @osv_scanner.scan(sbom_json)
    return scan_result if scan_result.failure?

    advisories = build_advisories(scan_result.value!)
    Success(advisories)
  end

  private

  def build_advisories(osv_results)
    osv_results.flat_map do |package_finding|
      level = @severity_classifier.classify(package_finding)
      next if level.nil?

      {
        level: level,
        package: package_finding[:package][:name],
        url: extract_url(package_finding),
        description: extract_description(package_finding)
      }
    end.compact
  end
end
```

### Boot Layer (Composition Root)

#### TypeScript

```typescript
// boot/scanner.ts
export const scanner = createScanner({
  osvScanner: createOsvScannerCliAdapter(),
  // Other dependencies...
});
```

#### Ruby

```ruby
# config/initializers/scanner.rb
Rails.application.config.security_scanner = SecurityService.new(
  lock_parser: Foundation::GemfileLockParser,
  sbom_generator: Domain::SbomGenerator,
  severity_classifier: Domain::SeverityClassifier,
  osv_scanner: OsvApiAdapter.new
)
```

## Dependency Injection in Rails

### TypeScript Approach

```typescript
type Dependencies = {
  readonly parseLock: (lock: unknown) => Result<...>;
  readonly osvScanner: OsvScannerPort;
};

const createService = (deps: Dependencies) => ({
  scan: async (lock) => {
    const parsed = deps.parseLock(lock);
    // ...
  }
});
```

### Rails Approach (Constructor Injection)

```ruby
class SecurityService
  def initialize(lock_parser:, osv_scanner:)
    @lock_parser = lock_parser
    @osv_scanner = osv_scanner
  end

  def scan(lockfile)
    parsed = @lock_parser.parse(lockfile)
    # ...
  end
end

# Usage (with defaults)
SecurityService.new(
  lock_parser: GemfileLockParser,
  osv_scanner: OsvApiAdapter.new
)
```

### Using dry-container (Advanced)

```ruby
# config/initializers/container.rb
require 'dry/container'

class AppContainer
  extend Dry::Container::Mixin

  register(:lock_parser) { Foundation::GemfileLockParser }
  register(:sbom_generator) { Domain::SbomGenerator }
  register(:osv_scanner) { OsvApiAdapter.new }
  register(:security_service) {
    SecurityService.new(
      lock_parser: resolve(:lock_parser),
      osv_scanner: resolve(:osv_scanner)
    )
  }
end
```

## Testing in Rails

### RSpec Structure

```ruby
# spec/services/domain/severity_classifier_spec.rb
RSpec.describe Domain::SeverityClassifier do
  describe '.classify' do
    it 'returns fatal for CRITICAL severity label' do
      finding = {
        package: { name: 'test', version: '1.0.0', ecosystem: 'RubyGems' },
        vulnerabilities: [{
          id: 'TEST-001',
          database_specific: { severity: 'CRITICAL' }
        }]
      }

      expect(described_class.classify(finding)).to eq('fatal')
    end

    it 'returns warn for MODERATE severity label' do
      finding = {
        package: { name: 'test', version: '1.0.0', ecosystem: 'RubyGems' },
        vulnerabilities: [{
          id: 'TEST-002',
          database_specific: { severity: 'MODERATE' }
        }]
      }

      expect(described_class.classify(finding)).to eq('warn')
    end
  end
end
```

### Testing with Stubs

```ruby
# spec/services/security_service_spec.rb
RSpec.describe SecurityService do
  describe '#scan' do
    it 'returns advisories when vulnerabilities found' do
      lock_parser = double('LockParser')
      osv_scanner = double('OsvScanner')

      allow(lock_parser).to receive(:parse).and_return(
        Success([{ name: 'test', version: '1.0.0', ecosystem: 'RubyGems' }])
      )
      allow(osv_scanner).to receive(:scan).and_return(
        Success([{ vulnerabilities: [...] }])
      )

      service = SecurityService.new(
        lock_parser: lock_parser,
        osv_scanner: osv_scanner
      )

      result = service.scan('lockfile content')
      expect(result).to be_success
      expect(result.value!).to include(level: 'fatal')
    end
  end
end
```

## Key Differences & Considerations

### 1. Synchronous vs. Asynchronous

**TypeScript:**
```typescript
async scan(lock): Promise<Result<...>> { ... }
```

**Ruby:**
```ruby
def scan(lock)
  # Ruby I/O is typically synchronous
  # Use Sidekiq/ActiveJob for background processing
end
```

### 2. Immutability

**TypeScript:**
```typescript
type Result<T> = {
  readonly ok: boolean;
  readonly data: T;
};
```

**Ruby:**
```ruby
# Use #freeze for immutability
Result = Struct.new(:ok, :data, keyword_init: true) do
  def initialize(*)
    super
    freeze
  end
end
```

### 3. Type Safety

**TypeScript:** Compile-time type checking (built-in)

**Ruby:** Runtime type checking + optional static analysis
```ruby
# Using Sorbet
# typed: strict
sig { params(lock: String).returns(T.any(Success, Failure)) }
def scan(lock)
  # ...
end
```

### 4. Error Handling

**TypeScript:** `Result<T, E>` type

**Ruby:** `dry-monads` or Railway-oriented programming
```ruby
include Dry::Monads[:result, :do]

def scan(lock)
  coordinates = yield parse_lock(lock)
  sbom = yield generate_sbom(coordinates)
  vulnerabilities = yield scan_sbom(sbom)
  Success(build_advisories(vulnerabilities))
end
```

## Migration Checklist

- [ ] Set up Ruby 3.x with Rails 7+
- [ ] Add `dry-monads` gem for Result types
- [ ] Consider Sorbet or RBS for type checking
- [ ] Create directory structure (`app/adapters/`, `app/services/domain/`, etc.)
- [ ] Migrate foundation utilities to `lib/`
- [ ] Implement core business logic in `app/services/domain/`
- [ ] Create port modules in `app/ports/`
- [ ] Implement OSV HTTP API adapter in `app/adapters/`
- [ ] Create orchestration service in `app/services/`
- [ ] Set up dependency injection in initializers
- [ ] Write RSpec tests for each layer
- [ ] Replace `bun.lock` parsing with `Gemfile.lock` parsing
- [ ] Replace CLI invocation with HTTP API calls
- [ ] Add error monitoring (Sentry, Rollbar, etc.)
- [ ] Set up CI/CD with RSpec tests

## Recommended Gems

```ruby
# Gemfile
gem 'dry-monads'          # Result/Either types
gem 'dry-container'       # Dependency injection
gem 'dry-validation'      # Schema validation
gem 'http'                # HTTP client for OSV API
gem 'sorbet-runtime'      # Type checking (optional)

group :development, :test do
  gem 'sorbet'
  gem 'rspec-rails'
  gem 'factory_bot_rails'
  gem 'webmock'           # HTTP request stubbing
end
```

## Summary

This architecture translates well to Rails because:
1. ✅ **Layered architecture** works in any language
2. ✅ **Dependency injection** maps to Ruby's flexibility
3. ✅ **Result types** available via dry-monads
4. ✅ **Pure functions** achievable with module functions
5. ✅ **Testability** enhanced by RSpec and stubs

The main differences are:
- Use OSV HTTP API instead of CLI
- Parse `Gemfile.lock` instead of `bun.lock`
- Use `dry-monads` instead of custom Result types
- Consider Sorbet for optional type safety
